(function () {
  'use strict';

  var root = document.querySelector('.rooms-page');
  if (!root) return;
  var API = document.documentElement.dataset.roomsApi || location.origin;
  var enter = document.getElementById('roomsEnter');
  var status = document.getElementById('roomsStatus');
  var interior = document.getElementById('roomsInterior');
  var walletLabel = document.getElementById('bearerWallet');
  var keyLabel = document.getElementById('bearerKey');
  var leave = document.getElementById('leaveRooms');
  var clock = document.getElementById('sessionClock');
  var salon = document.querySelector('.salon');
  var presence = document.getElementById('salonPresence');
  var record = document.getElementById('salonRecord');
  var empty = document.getElementById('salonEmpty');
  var form = document.getElementById('salonCompose');
  var input = document.getElementById('salonMessage');
  var submit = form.querySelector('button[type="submit"]');
  var count = document.getElementById('salonCount');
  var session = null;
  var connection = null;
  var timer = null;
  var messageIds = new Set();

  function base58Encode(input) {
    var alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    var source = input instanceof Uint8Array ? input : new Uint8Array(input || []);
    if (!source.length) return '';
    var digits = [0];
    for (var byteIndex = 0; byteIndex < source.length; byteIndex += 1) {
      var carry = source[byteIndex];
      for (var digitIndex = 0; digitIndex < digits.length; digitIndex += 1) {
        carry += digits[digitIndex] << 8;
        digits[digitIndex] = carry % 58;
        carry = Math.floor(carry / 58);
      }
      while (carry > 0) { digits.push(carry % 58); carry = Math.floor(carry / 58); }
    }
    var zeroes = 0;
    while (zeroes < source.length - 1 && source[zeroes] === 0) zeroes += 1;
    var output = new Array(zeroes + 1).join('1');
    for (var index = digits.length - 1; index >= 0; index -= 1) output += alphabet[digits[index]];
    return output;
  }

  function shortAddress(value) {
    value = String(value || '');
    return value.length > 14 ? value.slice(0, 6) + '…' + value.slice(-6) : value;
  }

  function apiUrl(path) { return new URL(path, API).toString(); }

  async function api(path, options) {
    options = options || {};
    var headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    if (session && options.authorized !== false) headers.set('Authorization', 'Bearer ' + session.token);
    var response = await fetch(apiUrl(path), {
      method: options.method || 'GET',
      headers: headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store',
    });
    var payload = null;
    try { payload = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(payload && payload.error || 'The House did not answer.');
    return payload;
  }

  function setStatus(message, isError) {
    status.textContent = message;
    status.style.color = isError ? '#e0685f' : '';
  }

  function closeConnection() {
    if (connection) {
      connection.onclose = null;
      connection.close(1000, 'left room');
      connection = null;
    }
    salon.dataset.connection = 'waiting';
    presence.textContent = 'DISCONNECTED';
    input.disabled = true;
    submit.disabled = true;
  }

  function lockRooms(message) {
    closeConnection();
    session = null;
    clearInterval(timer);
    timer = null;
    root.dataset.roomState = 'sealed';
    interior.hidden = true;
    enter.disabled = false;
    enter.textContent = 'SIGN THE REGISTER';
    messageIds.clear();
    record.replaceChildren(empty);
    empty.hidden = false;
    if (message) setStatus(message, false);
  }

  function updateClock() {
    if (!session) return;
    var remaining = Math.max(0, session.expiresAt - Date.now());
    var seconds = Math.ceil(remaining / 1000);
    clock.textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
    if (remaining <= 0) lockRooms('The register entry expired. Sign again to return.');
  }

  function appendMessage(message) {
    if (!message || !message.id || messageIds.has(message.id)) return;
    messageIds.add(message.id);
    empty.hidden = true;
    var article = document.createElement('article');
    article.className = 'salon-message';
    article.dataset.messageId = message.id;
    var meta = document.createElement('div');
    meta.className = 'salon-message-meta';
    var key = document.createElement('strong');
    key.textContent = message.keyName || 'THE KEY';
    var wallet = document.createElement('code');
    wallet.textContent = shortAddress(message.wallet);
    wallet.title = String(message.wallet || '');
    var time = document.createElement('time');
    var date = new Date(Number(message.createdAt) || Date.now());
    time.dateTime = date.toISOString();
    time.textContent = date.toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    var text = document.createElement('p');
    text.textContent = String(message.content || '');
    meta.append(key, wallet, time);
    article.append(meta, text);
    record.append(article);
    record.scrollTop = record.scrollHeight;
  }

  async function loadHistory() {
    var payload = await api('/rpc/rooms/history?room=salon');
    (payload.messages || []).forEach(appendMessage);
  }

  async function openSalon() {
    var ticket = await api('/rpc/rooms/socket-ticket?room=salon', { method:'POST' });
    var socketUrl = new URL('/rpc/rooms/live', API);
    socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    socketUrl.searchParams.set('room', 'salon');
    socketUrl.searchParams.set('wallet', session.wallet);
    socketUrl.searchParams.set('ticket', ticket.ticket);
    connection = new WebSocket(socketUrl.toString());
    connection.onmessage = function (event) {
      var payload;
      try { payload = JSON.parse(event.data); } catch (_) { return; }
      if (payload.type === 'ready') {
        salon.dataset.connection = 'live';
        presence.textContent = String(payload.connected || 1) + ' PRESENT';
        input.disabled = false;
        submit.disabled = false;
      } else if (payload.type === 'presence') {
        presence.textContent = String(payload.connected || 0) + ' PRESENT';
      } else if (payload.type === 'message') {
        appendMessage(payload.message);
      } else if (payload.type === 'error') {
        setStatus(payload.error || 'The room refused that message.', true);
      }
    };
    connection.onclose = function (event) {
      connection = null;
      salon.dataset.connection = 'waiting';
      presence.textContent = event.code === 4401 ? 'SIGNATURE EXPIRED' : 'DISCONNECTED';
      input.disabled = true;
      submit.disabled = true;
      if (event.code === 4401) lockRooms('The register entry expired. Sign again to return.');
    };
    connection.onerror = function () { setStatus('The Salon could not be reached.', true); };
  }

  async function admit() {
    if (!window.BullenWalletChooser) throw new Error('The wallet register is still loading.');
    var connected = await window.BullenWalletChooser.connect();
    if (!connected) return;
    if (!connected.provider || typeof connected.provider.signMessage !== 'function') {
      throw new Error(connected.name + ' cannot sign a plain-text message in this browser.');
    }
    setStatus('Preparing a one-use register entry…', false);
    var result = await api('/rpc/rooms/challenge', {
      method:'POST', authorized:false, body:{ wallet:connected.address },
    });
    setStatus('Review the plain-text register entry inside your wallet.', false);
    var signed = await connected.provider.signMessage(new TextEncoder().encode(result.challenge.message), 'utf8');
    var signatureBytes = signed && signed.signature ? signed.signature : signed;
    var signature = typeof signatureBytes === 'string' ? signatureBytes : base58Encode(signatureBytes);
    var admitted = await api('/rpc/rooms/session', {
      method:'POST', authorized:false,
      body:{ wallet:connected.address, challengeId:result.challenge.id, signature:signature },
    });
    session = {
      token:admitted.session,
      wallet:admitted.wallet,
      key:admitted.key,
      expiresAt:Number(admitted.expiresAt),
    };
    root.dataset.roomState = 'admitted';
    interior.hidden = false;
    walletLabel.textContent = shortAddress(session.wallet);
    walletLabel.title = session.wallet;
    keyLabel.textContent = session.key.name;
    enter.textContent = 'REGISTER SIGNED';
    setStatus(session.key.name + ' admitted. The Salon is opening.', false);
    clearInterval(timer);
    updateClock();
    timer = setInterval(updateClock, 1000);
    await loadHistory();
    await openSalon();
    interior.scrollIntoView({ behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start' });
  }

  enter.addEventListener('click', async function () {
    enter.disabled = true;
    try { await admit(); }
    catch (error) {
      lockRooms();
      setStatus(error && error.message || 'The register could not be signed.', true);
    } finally {
      if (!session) enter.disabled = false;
    }
  });

  leave.addEventListener('click', function () { lockRooms('You left the Inner Rooms.'); });
  input.addEventListener('input', function () { count.textContent = String(Array.from(input.value).length) + ' / 600'; });
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var content = input.value.trim();
    if (!content || !connection || connection.readyState !== WebSocket.OPEN) return;
    connection.send(JSON.stringify({ type:'message', content:content }));
    input.value = '';
    count.textContent = '0 / 600';
  });
  window.addEventListener('pagehide', closeConnection);
}());

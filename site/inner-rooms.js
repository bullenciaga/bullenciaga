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
  var form = document.getElementById('salonCompose');
  var input = document.getElementById('salonMessage');
  var submit = form.querySelector('button[type="submit"]');
  var count = document.getElementById('salonCount');
  var attach = document.getElementById('salonAttach');
  var imageFile = document.getElementById('salonImageFile');
  var imageDraft = document.getElementById('salonImageDraft');
  var imagePreview = document.getElementById('salonImagePreview');
  var imageDetails = document.getElementById('salonImageDetails');
  var removeImage = document.getElementById('salonRemoveImage');
  var composeStatus = document.getElementById('salonComposeStatus');
  var imageViewer = document.getElementById('salonImageViewer');
  var fullImage = document.getElementById('salonFullImage');
  var pendingImage = null;
  var pendingSend = null;
  var preparingImage = false;
  var sending = false;
  var imageGeneration = 0;
  var imageUrls = new Set();
  var imageRequests = new Set();
  var imageQueue = [];
  var imageLoads = 0;
  var imageObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) { imageObserver.unobserve(entry.target); queueImage(entry.target); }
    });
  }, { root:record, rootMargin:'100px' }) : null;
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

  function signatureBase58(value) {
    if (typeof value === 'string') return value;
    if (value && Array.isArray(value.data)) return base58Encode(Uint8Array.from(value.data));
    if (Array.isArray(value)) return base58Encode(Uint8Array.from(value));
    if (value instanceof ArrayBuffer) return base58Encode(new Uint8Array(value));
    if (ArrayBuffer.isView(value)) {
      return base58Encode(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    }
    return base58Encode(value);
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
    if (!response.ok) {
      throw new Error(payload && payload.error || 'The House did not answer (HTTP ' + response.status + ').');
    }
    return payload;
  }

  function setStatus(message, isError) {
    status.textContent = message;
    status.style.color = isError ? '#e0685f' : '';
  }

  function setComposeStatus(message, isError) {
    composeStatus.textContent = message;
    composeStatus.style.color = isError ? '#e0685f' : '';
  }

  function updateCompose() {
    var unavailable = !session || !connection || connection.readyState !== WebSocket.OPEN || salon.dataset.connection !== 'live';
    input.disabled = unavailable || sending;
    attach.disabled = unavailable || sending || preparingImage;
    removeImage.disabled = sending;
    submit.disabled = unavailable || sending || preparingImage;
    submit.textContent = sending ? 'PLACING…' : 'PLACE IN ROOM';
  }

  function clearImage() {
    imageGeneration += 1;
    preparingImage = false;
    if (pendingImage) URL.revokeObjectURL(pendingImage.url);
    pendingImage = null;
    pendingSend = null;
    imagePreview.removeAttribute('src');
    imageDraft.hidden = true;
    imageFile.value = '';
    updateCompose();
  }

  function closeImageViewer() {
    if (imageViewer.open) imageViewer.close();
    fullImage.removeAttribute('src');
  }

  async function prepareImage(file) {
    if (!file || !session || sending) return;
    clearImage();
    var generation = imageGeneration;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 12 * 1024 * 1024) {
      setComposeStatus('Choose a JPG, PNG or WebP image under 12 MB.', true);
      return;
    }
    preparingImage = true;
    updateCompose();
    setComposeStatus('Preparing your image…', false);
    var sourceUrl = URL.createObjectURL(file);
    try {
      var source = new Image();
      source.src = sourceUrl;
      await source.decode();
      if (generation !== imageGeneration || !session) return;
      if (source.naturalWidth * source.naturalHeight > 40_000_000) throw new Error('This image is too large to resize here. Export a smaller copy.');
      var scale = Math.min(1, 1600 / Math.max(source.naturalWidth, source.naturalHeight));
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
      var context = canvas.getContext('2d');
      context.fillStyle = '#070706';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      var blob;
      for (var quality = 0.9; quality >= 0.4; quality -= 0.1) {
        blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', quality); });
        if (blob && blob.size <= 320 * 1024) break;
      }
      if (generation !== imageGeneration || !session) return;
      if (!blob || blob.size > 320 * 1024) throw new Error('This image is still too detailed. Crop it or choose a smaller copy.');
      var dataUrl = await new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      if (generation !== imageGeneration || !session) return;
      pendingImage = { data:String(dataUrl).split(',')[1], url:URL.createObjectURL(blob) };
      imagePreview.src = pendingImage.url;
      imageDetails.textContent = canvas.width + ' × ' + canvas.height + ' · ' + Math.ceil(blob.size / 1024) + ' KB';
      imageDraft.hidden = false;
      setComposeStatus('Image ready. Add a message if you like.', false);
    } catch (error) {
      if (generation === imageGeneration) setComposeStatus(error && error.message || 'That image could not be opened. Try a JPG or PNG.', true);
    } finally {
      URL.revokeObjectURL(sourceUrl);
      if (generation === imageGeneration) { preparingImage = false; updateCompose(); }
    }
  }

  function queueImage(button) {
    if (!session || button.dataset.loading === 'true' || button.dataset.loaded === 'true') return;
    button.dataset.loading = 'true';
    imageQueue.push({ button:button, session:session });
    pumpImages();
  }

  function pumpImages() {
    while (imageLoads < 2 && imageQueue.length) {
      var job = imageQueue.shift();
      if (job.session !== session) continue;
      imageLoads += 1;
      loadImage(job).finally(function () { imageLoads -= 1; pumpImages(); });
    }
  }

  async function loadImage(job) {
    var button = job.button;
    var controller = new AbortController();
    imageRequests.add(controller);
    try {
      var response = await fetch(apiUrl('/rpc/rooms/image?room=salon&id=' + encodeURIComponent(button.dataset.imageId)), {
        headers:{ Authorization:'Bearer ' + job.session.token }, cache:'no-store', signal:controller.signal,
      });
      if (!response.ok) throw new Error('Image unavailable · tap to retry');
      var blob = await response.blob();
      if (session !== job.session) return;
      if (blob.type !== 'image/jpeg' || blob.size > 320 * 1024) throw new Error('Image unavailable');
      var url = URL.createObjectURL(blob);
      imageUrls.add(url);
      button.querySelector('img').src = url;
      button.dataset.loaded = 'true';
      button.querySelector('span').textContent = 'OPEN IMAGE ↗';
    } catch (error) {
      if (session === job.session && error.name !== 'AbortError') button.querySelector('span').textContent = error.message || 'Image unavailable · tap to retry';
    } finally { button.dataset.loading = 'false'; imageRequests.delete(controller); }
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
    attach.disabled = true;
  }

  function lockRooms(message) {
    closeConnection();
    session = null;
    sending = false;
    clearImage();
    closeImageViewer();
    if (imageObserver) imageObserver.disconnect();
    imageQueue = [];
    imageRequests.forEach(function (request) { request.abort(); });
    imageUrls.forEach(function (url) { URL.revokeObjectURL(url); });
    imageUrls.clear();
    input.value = '';
    count.textContent = '0 / 600';
    setComposeStatus('', false);
    clearInterval(timer);
    timer = null;
    root.dataset.roomState = 'sealed';
    interior.hidden = true;
    enter.disabled = false;
    enter.textContent = 'SIGN THE REGISTER';
    messageIds.clear();
    record.replaceChildren();
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
    var body = document.createElement('div');
    body.className = 'salon-message-body';
    body.append(text);
    if (message.image && /^[0-9a-f-]{36}$/i.test(String(message.image.id || ''))) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'salon-message-image';
      button.dataset.imageId = message.image.id;
      button.setAttribute('aria-label', 'Open image shared by ' + (message.keyName || 'Key bearer'));
      var image = document.createElement('img');
      image.alt = 'Image shared in The Salon';
      image.width = Math.max(1, Math.min(1600, Number(message.image.width) || 280));
      image.height = Math.max(1, Math.min(1600, Number(message.image.height) || 210));
      var hint = document.createElement('span');
      hint.textContent = 'LOADING IMAGE…';
      button.append(image, hint);
      button.addEventListener('click', function () {
        if (!session) return;
        if (button.dataset.loaded !== 'true') { queueImage(button); return; }
        fullImage.src = image.src;
        imageViewer.showModal();
      });
      body.append(button);
      if (imageObserver) imageObserver.observe(button);
      else queueImage(button);
    }
    article.append(meta, body);
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
        updateCompose();
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
      attach.disabled = true;
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
    var signature = signatureBase58(signatureBytes);
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
  input.addEventListener('input', function () { pendingSend = null; count.textContent = String(Array.from(input.value).length) + ' / 600'; });
  attach.addEventListener('click', function () { imageFile.click(); });
  imageFile.addEventListener('change', function () { void prepareImage(imageFile.files[0]); });
  removeImage.addEventListener('click', function () { clearImage(); setComposeStatus('', false); });
  input.addEventListener('paste', function (event) {
    var file = Array.from(event.clipboardData && event.clipboardData.files || []).find(function (item) { return item.type.indexOf('image/') === 0; });
    if (file) { event.preventDefault(); void prepareImage(file); }
  });
  document.getElementById('salonCloseImage').addEventListener('click', closeImageViewer);
  imageViewer.addEventListener('click', function (event) { if (event.target === imageViewer) closeImageViewer(); });
  imageViewer.addEventListener('close', function () { fullImage.removeAttribute('src'); });
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    var content = input.value.trim();
    if ((!content && !pendingImage) || !session || !connection || connection.readyState !== WebSocket.OPEN || sending || preparingImage) return;
    var sendingSession = session;
    if (!pendingSend) pendingSend = { id:crypto.randomUUID(), content:content,
      ...(pendingImage ? { image:{ type:'image/jpeg', data:pendingImage.data } } : {}) };
    sending = true;
    updateCompose();
    setComposeStatus('Placing your message…', false);
    try {
      var result = await api('/rpc/rooms/message?room=salon', { method:'POST', body:pendingSend });
      if (session !== sendingSession) return;
      appendMessage(result.message);
      input.value = '';
      count.textContent = '0 / 600';
      clearImage();
      setComposeStatus('', false);
    } catch (error) {
      if (session === sendingSession) setComposeStatus(error.message || 'The message was not confirmed. Your draft is kept; try again.', true);
    } finally {
      if (session === sendingSession) { sending = false; updateCompose(); }
    }
  });
  window.addEventListener('pagehide', closeConnection);
  window.addEventListener('pagehide', function () { lockRooms(); });
}());

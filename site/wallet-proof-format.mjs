// Wallet ownership proof v1. This is NOT a payment transaction.
// Kept byte-identical in the website, RPC verifier and House Objects verifier.
export function hwBase58Decode(value) {
  if (typeof value !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(value)) throw new Error('Invalid base58');
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n;
  for (const c of value) n = n * 58n + BigInt(alphabet.indexOf(c));
  const bytes = [];
  while (n) { bytes.push(Number(n & 255n)); n >>= 8n; }
  for (const c of value) { if (c !== '1') break; bytes.push(0); }
  return Uint8Array.from(bytes.reverse());
}
export function hwBase58Encode(bytes) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n, out = '';
  for (const b of bytes) n = n * 256n + BigInt(b);
  while (n) { out = alphabet[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; out = '1' + out; }
  return out;
}
export function hardwareProofMessage(wallet, message, issued, nonce) {
  if (!/^[0-9]{13}$/.test(String(issued)) || !/^[0-9a-f]{32}$/.test(nonce)) throw new Error('Malformed wallet proof');
  const pub = hwBase58Decode(wallet);
  if (pub.length !== 32) throw new Error('Invalid wallet');
  const memo = new TextEncoder().encode('BULLENCIAGA wallet ownership\nDomain: bullenciaga.com\nIssued: ' + issued + '\nNonce: ' + nonce + '\n\n' + message);
  if (memo.length > 900) throw new Error('Wallet proof too long');
  const memoProgram = hwBase58Decode('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
  const length = memo.length < 128 ? [memo.length] : [(memo.length & 127) | 128, memo.length >> 7];
  // Legacy Solana message: one signer/payer, read-only Memo program, an
  // impossible all-zero recent blockhash, exactly one memo instruction.
  // No transfer, approval, durable nonce, additional signer or writable asset.
  return Uint8Array.from([1, 0, 1, 2, ...pub, ...memoProgram, ...new Uint8Array(32), 1, 1, 1, 0, ...length, ...memo]);
}
export function walletProofPayload(wallet, proof, message, now = Date.now()) {
  if (typeof proof !== 'string' || proof.length > 200) throw new Error('Malformed wallet proof');
  if (!proof.startsWith('ledger-v1:')) {
    const signature = hwBase58Decode(proof);
    if (signature.length !== 64) throw new Error('Invalid signature length');
    return { signature, message: new TextEncoder().encode(message) };
  }
  const match = /^ledger-v1:([0-9]{13}):([0-9a-f]{32}):([1-9A-HJ-NP-Za-km-z]{64,88})$/.exec(proof);
  if (!match) throw new Error('Malformed Ledger proof');
  const issued = Number(match[1]);
  if (issued > now + 30000 || now - issued > 300000) throw new Error('Wallet proof expired. Please sign again.');
  const signature = hwBase58Decode(match[3]);
  if (signature.length !== 64) throw new Error('Invalid signature length');
  return { signature, message: hardwareProofMessage(wallet, message, match[1], match[2]) };
}

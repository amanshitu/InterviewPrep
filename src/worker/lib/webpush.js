// Web Push (RFC 8291 message encryption + RFC 8292 VAPID), implemented with
// only native WebCrypto — no npm dependency, matching this app's established
// dependency-light convention (see DEVELOPMENT.md: CSV import, PDF text
// extraction, and the resume-prompt builder all made the same call).

function base64UrlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concatBytes(...arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, dataBytes);
  return new Uint8Array(sig);
}

// Signs a VAPID JWT (ES256) using the private key JWK stored as the
// VAPID_PRIVATE_KEY_JWK secret. `aud` must be the push endpoint's origin.
async function signVapidJwt(aud, subject, privateJwk) {
  const key = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject };
  const enc = (obj) => bytesToBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
  const signingInput = `${enc(header)}.${enc(payload)}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${bytesToBase64Url(new Uint8Array(sig))}`;
}

// RFC 8291: encrypts `payload` (a string) for a given subscription's
// p256dh/auth keys using aes128gcm content encoding.
async function encryptPayload(payload, p256dhB64url, authB64url) {
  const receiverPublicBytes = base64UrlToBytes(p256dhB64url);
  const authSecret = base64UrlToBytes(authB64url);
  const plaintext = new TextEncoder().encode(payload);

  const receiverPublicKey = await crypto.subtle.importKey(
    "raw",
    receiverPublicBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const senderKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const senderPublicBytes = new Uint8Array(await crypto.subtle.exportKey("raw", senderKeyPair.publicKey));

  const ecdhSecretBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: receiverPublicKey },
    senderKeyPair.privateKey,
    256,
  );
  const ecdhSecret = new Uint8Array(ecdhSecretBits);

  const authInfo = concatBytes(
    new TextEncoder().encode("WebPush: info\0"),
    receiverPublicBytes,
    senderPublicBytes,
  );
  const prkKey = await hmacSha256(authSecret, ecdhSecret);
  const ikm = (await hmacSha256(prkKey, concatBytes(authInfo, new Uint8Array([1])))).slice(0, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmacSha256(salt, ikm);
  const cekInfo = concatBytes(new TextEncoder().encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1]));
  const cek = (await hmacSha256(prk, cekInfo)).slice(0, 16);
  const nonceInfo = concatBytes(new TextEncoder().encode("Content-Encoding: nonce\0"), new Uint8Array([1]));
  const nonce = (await hmacSha256(prk, nonceInfo)).slice(0, 12);

  const cekKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const recordPlaintext = concatBytes(plaintext, new Uint8Array([2])); // 0x02 = last (and only) record
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, cekKey, recordPlaintext),
  );

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const idlen = new Uint8Array([senderPublicBytes.length]);
  const header = concatBytes(salt, rs, idlen, senderPublicBytes);

  return concatBytes(header, ciphertext);
}

// Sends one Web Push notification. `subscription` is { endpoint, p256dh, auth }
// (from a PushSubscription.toJSON()'s `keys`); `payloadObj` is JSON-serializable;
// `vapidPrivateJwk` is the stored VAPID_PRIVATE_KEY_JWK secret (parsed).
export async function sendWebPush(subscription, payloadObj, vapidPublicKey, vapidPrivateJwk, subject) {
  const endpointUrl = new URL(subscription.endpoint);
  const aud = `${endpointUrl.protocol}//${endpointUrl.host}`;
  const jwt = await signVapidJwt(aud, subject, vapidPrivateJwk);
  const body = await encryptPayload(JSON.stringify(payloadObj), subscription.p256dh, subscription.auth);

  return fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
    },
    body,
  });
}

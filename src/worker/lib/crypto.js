export function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

export function randomHex(numBytes) {
  const bytes = new Uint8Array(numBytes);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBytes(saltHex),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

// ---------- BYOK encryption ----------
// Per-user AI provider keys are encrypted at rest with AES-GCM, using a
// master key that only exists as a Worker secret (never in D1). Plaintext
// keys only ever exist in memory for the duration of the request that
// needs them.
async function getMasterKey(env) {
  const raw = hexToBytes(env.AI_KEY_ENCRYPTION_SECRET);
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(env, plaintext) {
  const key = await getMasterKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc);
  return { ciphertext: bytesToHex(new Uint8Array(ciphertext)), iv: bytesToHex(iv) };
}

export async function decryptSecret(env, ciphertextHex, ivHex) {
  const key = await getMasterKey(env);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: hexToBytes(ivHex) },
    key,
    hexToBytes(ciphertextHex),
  );
  return new TextDecoder().decode(plainBuf);
}

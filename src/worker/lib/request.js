// Reads and parses a JSON request body, defensively capping its size so a
// huge payload can't be used to burn CPU/memory before we've even validated
// anything. Returns { ok: true, body } or { ok: false, status, error }.
export async function readJsonBody(request, maxBytes = 10000) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    return { ok: false, status: 413, error: "Request body too large." };
  }
  let text;
  try {
    text = await request.text();
  } catch {
    return { ok: false, status: 400, error: "Invalid request body." };
  }
  if (text.length > maxBytes) {
    return { ok: false, status: 413, error: "Request body too large." };
  }
  try {
    return { ok: true, body: text ? JSON.parse(text) : {} };
  } catch {
    return { ok: false, status: 400, error: "Invalid request body." };
  }
}

export function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

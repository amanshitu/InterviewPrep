export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // The theme-flash-prevention inline script in index.html's <head> runs
  // before app.js (a deferred module) even loads, so it can't be external —
  // it's allowlisted by hash instead of 'unsafe-inline'. Recompute this if
  // that script's exact text ever changes (see index.html <head>).
  // https://challenges.cloudflare.com loads the Turnstile widget script on
  // login/signup/forgot-password (invisible captcha — see
  // src/web/lib/turnstile.ts); it needs its own frame for the challenge
  // iframe too (frame-src), even in invisible mode.
  "script-src 'self' 'sha256-LBYsBVLhXWkf/9YHxDzIi/0rU6rD6eVxv1UKeUYswZY=' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  // Inline style="" attributes are used throughout app.js's templated markup;
  // rewriting all of them to avoid 'unsafe-inline' isn't worth it for this app.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  // The Read aloud background-keep-alive track is a silent WAV built at
  // runtime as a Blob and played from its blob: object URL — needed so
  // background audio can keep speechSynthesis alive past a screen lock.
  "media-src 'self' blob:",
  "connect-src 'self' https://challenges.cloudflare.com",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

export function applySecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Workers always serve over HTTPS, so this is safe unconditionally; two
  // years + preload is the standard "commit to HTTPS forever" setting.
  headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  // Deny every powerful browser feature this app doesn't use — camera/mic
  // are used by Self Test's voice dictation THROUGH the browser's own
  // getUserMedia prompt, which Permissions-Policy would otherwise block.
  headers.set("Permissions-Policy", "camera=(), microphone=(self), geolocation=(), payment=(), usb=()");
  if ((headers.get("content-type") || "").includes("text/html")) {
    headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

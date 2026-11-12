// Optimistic "was this browser last known to be signed in?" flag. Lets
// AuthGate skip straight to /login (no wasted network round trip) for a
// visitor who almost certainly isn't signed in, while still confirming via
// GET /api/me for anyone who might be. The Login page must call
// markAuthed() right before navigating to "/" on a successful sign-in or
// signup, or the very next page load will incorrectly fast-path-redirect
// back to /login before the real session cookie gets a chance to prove
// itself via /api/me.
const AUTHED_FLAG_KEY = "lastKnownAuthed";

export function markAuthed(): void {
  try {
    localStorage.setItem(AUTHED_FLAG_KEY, "1");
  } catch {
    /* localStorage unavailable — best effort only */
  }
}

export function clearAuthedFlag(): void {
  try {
    localStorage.removeItem(AUTHED_FLAG_KEY);
  } catch {
    /* localStorage unavailable — best effort only */
  }
}

export function likelyAuthed(): boolean {
  try {
    return localStorage.getItem(AUTHED_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

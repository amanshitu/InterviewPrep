// Shared fetch wrapper for every src/web/api/*.ts domain module. Replicates
// the exact contract of the existing frontend's api() helper
// (public/app.js): same-origin fetch, JSON request/response, throws on a
// non-ok response with the parsed body attached — so existing error-handling
// call sites (reading err.status / err.data.error) keep working unchanged.
export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;

  constructor(message: string, status: number, data: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) {
    throw new ApiError(typeof data.error === "string" ? data.error : "Request failed.", res.status, data);
  }
  return data as T;
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// GET /api/export/progress returns a file download, not JSON — kept out of
// apiFetch<T>'s JSON-parsing path.
export async function apiFetchBlob(path: string): Promise<Blob> {
  const res = await fetch(path);
  if (!res.ok) {
    let data: Record<string, unknown> = {};
    try {
      data = await res.json();
    } catch {
      /* no body */
    }
    throw new ApiError(typeof data.error === "string" ? data.error : "Request failed.", res.status, data);
  }
  return res.blob();
}

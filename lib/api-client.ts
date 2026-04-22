import { auth } from "@/lib/firebase";

/**
 * Authenticated fetch — automatically includes Firebase ID token.
 * Drop-in replacement for fetch() on API calls.
 *
 * Usage:
 * ```
 * import { apiFetch } from "@/lib/api-client";
 * const res = await apiFetch("/api/datasets");
 * ```
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}

/**
 * Where to send someone after they sign in. Only a same-origin, relative
 * path is honoured: a public event page hands "/login?next=/app/events/<id>"
 * to the sign-in form, and the form must not become an open redirect to
 * "https://evil" or a protocol-relative "//evil". Anything else falls back.
 */
export function safeNext(raw: string | null | undefined, fallback = "/app"): string {
  if (!raw) return fallback;
  const v = raw.trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\s]/.test(v)) return fallback;
  // No scheme smuggling ("/\u0000http:") and nothing but URL-safe characters.
  if (!/^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#]*$/.test(v)) return fallback;
  return v;
}

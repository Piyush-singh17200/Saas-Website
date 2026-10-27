const INVITATION_REDIRECT_PATTERN = /^\/invitations\/[A-Za-z0-9_-]{16,256}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INTERNAL_BASE_URL = "https://workspace.invalid";

/**
 * Accepts only same-origin invitation acceptance paths. This prevents the
 * `redirect` query parameter from becoming an open redirect and keeps the
 * onboarding destination limited to the invitation flow it was created for.
 */
export function getSafeInvitationRedirect(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;

  try {
    const parsed = new URL(trimmed, INTERNAL_BASE_URL);
    if (parsed.origin !== INTERNAL_BASE_URL) return null;
    if (!INVITATION_REDIRECT_PATTERN.test(parsed.pathname)) return null;
    return parsed.pathname;
  } catch {
    return null;
  }
}

/**
 * Normalizes an invited email for display/prefill. Acceptance is still
 * authorized by the API against the invitation record; this helper only
 * prevents malformed or oversized query values from reaching the form.
 */
export function normalizeInvitationEmail(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;

  const email = value.trim().toLowerCase();
  if (!email || email.length > 320 || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

export function buildInvitationAuthHref(
  path: "/login" | "/register",
  params: { email?: string | null; redirect?: string | null },
): string {
  const search = new URLSearchParams();
  const email = normalizeInvitationEmail(params.email);
  const redirect = getSafeInvitationRedirect(params.redirect);

  if (email) search.set("email", email);
  if (redirect) search.set("redirect", redirect);

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

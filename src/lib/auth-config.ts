const EMAIL_SEPARATOR = /[\s,;]+/;

export function getAllowedEmails() {
  return (process.env.AUTH_ALLOWED_EMAILS ?? "")
    .split(EMAIL_SEPARATOR)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email: string | null | undefined) {
  if (!email) {
    return false;
  }

  return getAllowedEmails().includes(email.trim().toLowerCase());
}

export function hasAllowedEmailConfig() {
  return getAllowedEmails().length > 0;
}

/** Loose "looks like an email" check — matches what the ticket form has always used. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * True for a bare @psu.edu address. Ticket confirmations go to a personal
 * inbox, so the contact email must not be the university one. Subdomain
 * addresses (e.g. @ems.psu.edu) are deliberately allowed.
 */
export function isPsuEmail(email: string): boolean {
  return /@psu\.edu$/i.test(email.trim());
}

export const PSU_CONTACT_EMAIL_ERROR =
  "Please use a personal email, not your PSU email — confirmations go here.";

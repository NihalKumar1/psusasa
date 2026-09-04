// Sender identities for all outbound mail. Kept in one place because both
// senders must stay on the Resend-verified psusasa.com domain — the two
// drifting apart is how one of them ends up back on an unverified domain,
// silently 403ing every send (which is exactly what happened while these
// were two separate onboarding@resend.dev literals). Nothing receives mail
// at psusasa.com, so ticket confirmations point replies at the inbox the
// board actually reads.
export const TICKETS_FROM = "SASA Tickets <tickets@psusasa.com>";
export const MEMBERSHIP_FROM = "SASA Membership <noreply@psusasa.com>";
export const REPLY_TO = "exec.psusasa@gmail.com";

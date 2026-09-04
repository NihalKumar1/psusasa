import { Resend } from "resend";
import { MEMBERSHIP_FROM, REPLY_TO } from "@/lib/emailSender";

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// One place for every alert addressed to the board's own inbox
// (ADMIN_NOTIFICATION_EMAIL), so the Resend plumbing isn't copied per caller
// — the `{ data: null, error }` return that has to be inspected is exactly
// the detail a copy forgets, and forgetting it is how a whole class of sends
// failed silently for three weeks (see 422c480).
//
// Best-effort by design: an alert that can't be sent is logged, never thrown.
// Callers are fulfilling a payment; a mail failure must not fail that work.
// Returns whether the send actually succeeded.
export async function sendAdminAlert(
  subject: string,
  lines: string[]
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_NOTIFICATION_EMAIL;

  if (!apiKey || !to) {
    console.error(
      `Cannot send admin alert "${subject}" — RESEND_API_KEY or ADMIN_NOTIFICATION_EMAIL not set.`
    );
    return false;
  }

  const resend = new Resend(apiKey);

  try {
    const { error } = await resend.emails.send({
      from: MEMBERSHIP_FROM,
      replyTo: REPLY_TO,
      to,
      subject,
      text: lines.join("\n"),
    });

    if (error) {
      console.error(
        `Admin alert "${subject}" NOT sent to ${to} — ${error.name}: ${error.message}`
      );
      return false;
    }

    return true;
  } catch (err) {
    console.error(`Admin alert "${subject}" threw:`, err);
    return false;
  }
}

import { Resend } from "resend";
import { MEMBERSHIP_FROM, REPLY_TO } from "@/lib/emailSender";

interface MembershipConfirmationDetails {
  psuEmail: string;
  firstName: string;
  amountPaidCents: number;
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Sent once per membership signup. /join/return has always told the new
// member "a confirmation email will be sent to the PSU email you provided",
// but nothing ever sent one — the only mail they got was Stripe's receipt.
//
// Goes to the PSU email because that is the only address the membership form
// collects (the personal-email rule is ticket-only), and it's the address the
// return page promises. Best-effort: a failure here is logged, not thrown —
// it must never block fulfillment, which is already recorded in Airtable by
// the time this is called.
export async function sendMembershipConfirmationEmail(
  details: MembershipConfirmationDetails
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("Cannot send membership confirmation email — RESEND_API_KEY not set.");
    return false;
  }
  if (!details.psuEmail) {
    console.error("Cannot send membership confirmation email — no PSU email on signup.");
    return false;
  }

  const resend = new Resend(apiKey);
  const greeting = details.firstName.trim() ? `Hi ${details.firstName.trim()},` : "Hi,";

  try {
    // The SDK resolves with { data: null, error } on an API error rather
    // than throwing, so the catch below only ever sees network/transport
    // failures — `error` has to be inspected explicitly or every rejected
    // send reads as a success. This is exactly how the ticket confirmations
    // 403'd silently for three weeks.
    const { data, error } = await resend.emails.send({
      from: MEMBERSHIP_FROM,
      replyTo: REPLY_TO,
      to: details.psuEmail,
      subject: "Welcome to SASA — your membership is confirmed!",
      text: [
        greeting,
        "",
        "You're officially a member of Penn State's South Asian Student",
        "Association. Thanks for joining us!",
        "",
        `Amount paid: ${formatPrice(details.amountPaidCents)}`,
        "",
        "What's next:",
        "- You'll be added to our GroupMe, where everything gets announced first",
        "- Follow us on Instagram: https://instagram.com/psusasa",
        "- Members get discounted (sometimes free) tickets to our events —",
        "  use this same PSU email at checkout and the discount applies itself",
        "",
        "Stripe will send a separate receipt for the payment.",
        "",
        "See you soon!",
        "SASA",
      ].join("\n"),
    });

    if (error) {
      console.error(
        `Membership confirmation FAILED for ${details.psuEmail} — ` +
          `${error.name}: ${error.message}`
      );
      return false;
    }

    console.log(
      `Membership confirmation email sent to ${details.psuEmail} (id ${data?.id})`
    );
    return true;
  } catch (err) {
    console.error(
      `Membership confirmation FAILED for ${details.psuEmail} — threw:`,
      err
    );
    return false;
  }
}

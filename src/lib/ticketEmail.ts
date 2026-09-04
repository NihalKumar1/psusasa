import { Resend } from "resend";
import { REPLY_TO, TICKETS_FROM } from "@/lib/emailSender";

interface TicketConfirmationDetails {
  contactEmail: string;
  firstName: string;
  eventName: string;
  ticketTypeName: string;
  quantity: number;
  amountPaidCents: number;
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Card ticket purchases only (cash orders already get an inline "you're on
// the list" confirmation in the browser at checkout). Best-effort: a
// failure here is logged, not thrown — it must never block fulfillment,
// which is already recorded in Airtable by the time this is called.
// Returns whether the send actually succeeded, so a caller that cares can
// report real results instead of assuming. No caller checks it today; it
// stays because "assumed sent" is precisely what hid the 403 outage.
export async function sendTicketConfirmationEmail(
  details: TicketConfirmationDetails
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("Cannot send ticket confirmation email — RESEND_API_KEY not set.");
    return false;
  }
  if (!details.contactEmail) {
    console.error("Cannot send ticket confirmation email — no contact email on order.");
    return false;
  }

  const resend = new Resend(apiKey);
  const greeting = details.firstName.trim() ? `Hi ${details.firstName.trim()},` : "Hi,";

  try {
    // The SDK resolves with { data: null, error } on an API error rather
    // than throwing, so the catch below only ever sees network/transport
    // failures — `error` has to be inspected explicitly or every rejected
    // send reads as a success.
    const { data, error } = await resend.emails.send({
      from: TICKETS_FROM,
      replyTo: REPLY_TO,
      to: details.contactEmail,
      subject: `Your ticket to ${details.eventName} is confirmed!`,
      text: [
        greeting,
        "",
        "Your ticket purchase is confirmed:",
        "",
        `Event: ${details.eventName}`,
        `Ticket: ${details.quantity}x ${details.ticketTypeName}`,
        `Amount paid: ${formatPrice(details.amountPaidCents)}`,
        "",
        "No need to bring anything printed — just give your name at the door and we'll check you in.",
        "",
        "See you there!",
        "SASA",
      ].join("\n"),
    });

    if (error) {
      console.error(
        `Ticket confirmation FAILED for ${details.contactEmail} (${details.eventName}) — ` +
          `${error.name}: ${error.message}`
      );
      return false;
    }

    console.log(
      `Ticket confirmation email sent to ${details.contactEmail} (id ${data?.id})`
    );
    return true;
  } catch (err) {
    console.error(
      `Ticket confirmation FAILED for ${details.contactEmail} (${details.eventName}) — threw:`,
      err
    );
    return false;
  }
}

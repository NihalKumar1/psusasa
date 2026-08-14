import { Resend } from "resend";

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
export async function sendTicketConfirmationEmail(
  details: TicketConfirmationDetails
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("Cannot send ticket confirmation email — RESEND_API_KEY not set.");
    return;
  }
  if (!details.contactEmail) {
    console.error("Cannot send ticket confirmation email — no contact email on order.");
    return;
  }

  const resend = new Resend(apiKey);
  const greeting = details.firstName.trim() ? `Hi ${details.firstName.trim()},` : "Hi,";

  try {
    await resend.emails.send({
      from: "SASA Tickets <onboarding@resend.dev>",
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
    console.log(`Ticket confirmation email sent to ${details.contactEmail}`);
  } catch (err) {
    console.error("Failed to send ticket confirmation email:", err);
  }
}

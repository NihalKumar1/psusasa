import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { appendMemberToAirtable, appendTicketToAirtable } from "@/lib/airtable";
import { addMemberToGroupMe } from "@/lib/groupme";
import { sendTicketConfirmationEmail } from "@/lib/ticketEmail";
import { sendMembershipConfirmationEmail } from "@/lib/membershipEmail";
import { formatPrice, sendAdminAlert } from "@/lib/adminAlert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// A payment we can't attribute is money the board has to reconcile by hand,
// so it gets surfaced rather than dropped — but nothing is written to
// Airtable off a guess about what it was for.
async function alertUntaggedPayment(paymentIntent: Stripe.PaymentIntent) {
  const amount = formatPrice(paymentIntent.amount);

  console.warn(
    `Untagged payment_intent.succeeded (${paymentIntent.id}, ${amount}) — ` +
      `no purchaseType metadata, nothing recorded.`
  );

  await sendAdminAlert(`Payment received outside the site: ${amount}`, [
    `A payment succeeded that the website didn't create — it carries no`,
    `purchaseType metadata, so it isn't a membership signup or a ticket`,
    `order from psusasa.com. Most likely a card taken at the door with Tap`,
    `to Pay, or a charge made from the Stripe dashboard.`,
    ``,
    `Amount: ${amount}`,
    `Paid at: ${new Date(paymentIntent.created * 1000).toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short",
    })} (ET)`,
    `Description: ${paymentIntent.description || "(none)"}`,
    `Receipt email: ${paymentIntent.receipt_email || "(none)"}`,
    `Stripe Payment Intent: ${paymentIntent.id}`,
    `https://dashboard.stripe.com/payments/${paymentIntent.id}`,
    ``,
    `Nothing was written to Airtable and no one was added to the GroupMe.`,
    `If this was a membership or a ticket, please add them by hand.`,
  ]);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    if (!sig) {
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 }
      );
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 }
      );
    }

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const metadata = paymentIntent.metadata;

      if (metadata.purchaseType === "ticket") {
        const eventName = metadata.eventName ?? "";
        const ticketTypeName = metadata.ticketTypeName ?? "";
        const quantity = Number(metadata.quantity) || 1;

        const { inserted } = await appendTicketToAirtable(
          {
            firstName: metadata.firstName ?? "",
            lastName: metadata.lastName ?? "",
            contactEmail: metadata.contactEmail ?? "",
            psuEmail: metadata.psuEmail ?? "",
            isMember: metadata.isMember === "true",
            memberYear: metadata.memberYear || null,
            eventId: metadata.eventId ?? "",
            eventName,
            ticketTypeKey: metadata.ticketTypeKey ?? "",
            ticketTypeName,
            quantity,
            amountPaidCents: paymentIntent.amount,
            paymentMethod: "Card",
            paid: true,
            boardMemberName: null,
          },
          paymentIntent.id
        );

        // Only the write that actually lands sends the email — the webhook
        // and the /return page both call appendTicketToAirtable for the
        // same order, and `inserted` is false for whichever one loses the race.
        if (inserted) {
          await sendTicketConfirmationEmail({
            contactEmail: metadata.contactEmail ?? "",
            firstName: metadata.firstName ?? "",
            eventName,
            ticketTypeName,
            quantity,
            amountPaidCents: paymentIntent.amount,
          });
        }
      } else if (metadata.purchaseType === "membership") {
        const { inserted } = await appendMemberToAirtable(
          metadata,
          paymentIntent.id
        );

        // Same guard as the ticket branch above: the webhook and the
        // /join/return page both fulfill this signup, and `inserted` is
        // false for whichever one loses the race — so the member is
        // welcomed exactly once.
        if (inserted) {
          await sendMembershipConfirmationEmail({
            psuEmail: metadata.psuEmail ?? "",
            firstName: metadata.firstName ?? "",
            amountPaidCents: paymentIntent.amount,
          });
        }

        // GroupMe failure must not block the 200 response — it self-handles
        // errors by emailing the admin. Kept outside the email's control
        // flow so neither one failing can skip the other.
        try {
          await addMemberToGroupMe(metadata, paymentIntent.id);
        } catch (err) {
          console.error("GroupMe add threw unexpectedly:", err);
        }
      } else {
        // Both branches above match their tag positively, and anything
        // untagged lands here. This was once `else if (metadata)` — a
        // catch-all, since before ticketing existed every payment in the
        // account really was a membership. Stripe always sends `metadata`
        // as an object ({} when empty, never null), so that condition was
        // unconditional: card charges taken outside the site (Tap to Pay,
        // a dashboard charge) were filed as membership signups, writing a
        // blank Members row and firing a GroupMe add with no one to add.
        // Don't reintroduce a fall-through branch here.
        await alertUntaggedPayment(paymentIntent);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

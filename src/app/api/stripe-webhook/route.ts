import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { appendMemberToAirtable, appendTicketToAirtable } from "@/lib/airtable";
import { addMemberToGroupMe } from "@/lib/groupme";
import { sendTicketConfirmationEmail } from "@/lib/ticketEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

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

      if (metadata?.purchaseType === "ticket") {
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
            eventId: metadata.eventId ?? "",
            eventName,
            ticketTypeKey: metadata.ticketTypeKey ?? "",
            ticketTypeName,
            quantity,
            amountPaidCents: paymentIntent.amount,
            paymentMethod: "Card",
            paid: true,
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
      } else if (metadata) {
        await appendMemberToAirtable(metadata, paymentIntent.id);
        // Transfer students are added to GroupMe manually after admin
        // verifies their campus change proof email — skip the auto-add.
        if (metadata.membershipType !== "transfer") {
          // GroupMe failure must not block the 200 response — it self-handles
          // errors by emailing the admin.
          try {
            await addMemberToGroupMe(metadata, paymentIntent.id);
          } catch (err) {
            console.error("GroupMe add threw unexpectedly:", err);
          }
        }
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

import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { resolveTicketOrder, TicketOrderError } from "@/lib/ticketing";
import { computeCardFee } from "@/lib/fees";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      eventId,
      ticketTypeKey,
      quantity,
      firstName,
      lastName,
      contactEmail,
      psuEmail,
    } = body;

    const trimmedFirst = String(firstName ?? "").trim();
    const trimmedLast = String(lastName ?? "").trim();
    const trimmedEmail = String(contactEmail ?? "").trim();

    if (!trimmedFirst || !trimmedLast) {
      return NextResponse.json(
        { error: "Please enter your first and last name." },
        { status: 400 }
      );
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      return NextResponse.json(
        { error: "Please enter a valid contact email." },
        { status: 400 }
      );
    }

    let order;
    try {
      order = await resolveTicketOrder({
        eventId,
        ticketTypeKey,
        quantity,
        psuEmail,
      });
    } catch (err) {
      if (err instanceof TicketOrderError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    // Fee applied once to the order total, not per ticket — avoids stacking
    // Stripe's fixed $0.30 fee across a multi-ticket order.
    const { totalCents: amount, feeCents } = computeCardFee(order.subtotalCents);

    const metadata: Record<string, string> = {
      purchaseType: "ticket",
      eventId: order.event._id,
      eventName: order.event.title.slice(0, 500),
      ticketTypeKey: order.ticketType._key,
      ticketTypeName: order.ticketType.name.slice(0, 500),
      quantity: String(order.quantity),
      firstName: trimmedFirst.slice(0, 500),
      lastName: trimmedLast.slice(0, 500),
      contactEmail: trimmedEmail.slice(0, 500),
      psuEmail: String(psuEmail ?? "").trim().slice(0, 500),
      isMember: String(order.isMember),
      memberUnits: String(order.memberUnits),
      nonMemberUnits: String(order.nonMemberUnits),
      subtotalCents: String(order.subtotalCents),
      cardFeeCents: String(feeCents),
      amountPaidCents: String(amount),
    };

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      metadata,
      receipt_email: trimmedEmail,
      description: `SASA Tickets — ${order.event.title} (${order.ticketType.name})`,
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      isMember: order.isMember,
      memberUnits: order.memberUnits,
      nonMemberUnits: order.nonMemberUnits,
      subtotalCents: order.subtotalCents,
      feeCents,
      totalCents: amount,
    });
  } catch (err) {
    console.error("Ticket payment intent error:", err);
    return NextResponse.json(
      { error: "Failed to initialize payment" },
      { status: 500 }
    );
  }
}

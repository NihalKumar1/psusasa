import { NextRequest, NextResponse } from "next/server";
import { resolveTicketOrder, TicketOrderError } from "@/lib/ticketing";
import { appendTicketToAirtable } from "@/lib/airtable";

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

    // No Stripe involved and no card fee — cash buyers pay exactly the
    // member/non-member ticket price. Writes straight to Airtable since
    // there's no PaymentIntent/webhook to hand off to.
    await appendTicketToAirtable(
      {
        firstName: trimmedFirst.slice(0, 500),
        lastName: trimmedLast.slice(0, 500),
        contactEmail: trimmedEmail.slice(0, 500),
        psuEmail: String(psuEmail ?? "").trim().slice(0, 500),
        isMember: order.isMember,
        eventId: order.event._id,
        eventName: order.event.title.slice(0, 500),
        ticketTypeKey: order.ticketType._key,
        ticketTypeName: order.ticketType.name.slice(0, 500),
        quantity: order.quantity,
        amountPaidCents: order.subtotalCents,
        paymentMethod: "Cash",
        paid: false,
      },
      null
    );

    return NextResponse.json({
      eventName: order.event.title,
      ticketTypeName: order.ticketType.name,
      quantity: order.quantity,
      memberUnits: order.memberUnits,
      nonMemberUnits: order.nonMemberUnits,
      amountDueCents: order.subtotalCents,
    });
  } catch (err) {
    console.error("Cash ticket order error:", err);
    return NextResponse.json(
      { error: "Failed to record your order" },
      { status: 500 }
    );
  }
}

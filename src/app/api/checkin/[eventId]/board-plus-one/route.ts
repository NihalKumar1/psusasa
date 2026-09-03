import { NextRequest, NextResponse } from "next/server";
import { sanityFetchSingle } from "../../../../../../sanity/lib/client";
import {
  eventByIdQuery,
  boardMembersAuthQuery,
} from "../../../../../../sanity/lib/queries";
import type { SanityEvent, BoardMemberEntry } from "@/lib/types";
import { appendTicketToAirtable, listTicketsForEvent } from "@/lib/airtable";
import { BOARD_PLUS_ONE_TICKET_TYPE_KEY } from "@/lib/boardPlusOne";

export async function POST(
  req: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const { boardMemberKey, guestFirstName, guestLastName } = await req.json();

    if (
      typeof boardMemberKey !== "string" ||
      !boardMemberKey ||
      typeof guestFirstName !== "string" ||
      !guestFirstName.trim() ||
      typeof guestLastName !== "string" ||
      !guestLastName.trim()
    ) {
      return NextResponse.json(
        { error: "Missing board member or guest name." },
        { status: 400 }
      );
    }

    const event = await sanityFetchSingle<SanityEvent>(eventByIdQuery, {
      id: params.eventId,
    });
    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    if (!event.ticketingEnabled || !event.boardPlusOneEnabled) {
      return NextResponse.json(
        { error: "Board +1 is not enabled for this event." },
        { status: 400 }
      );
    }

    const roster = await sanityFetchSingle<{ members?: BoardMemberEntry[] }>(
      boardMembersAuthQuery
    );
    const member = roster?.members?.find((m) => m._key === boardMemberKey);
    if (!member) {
      return NextResponse.json(
        { error: "Not a recognized board member." },
        { status: 400 }
      );
    }
    const boardMemberName = `${member.firstName} ${member.lastName}`;

    // One +1 per board member per event — re-verified here since the
    // client's disabled dropdown option is only a UI hint, not enforcement.
    const existing = await listTicketsForEvent(params.eventId);
    const alreadyUsed = existing.some(
      (t) =>
        t.ticketTypeKey === BOARD_PLUS_ONE_TICKET_TYPE_KEY &&
        t.boardMemberName === boardMemberName
    );
    if (alreadyUsed) {
      return NextResponse.json(
        {
          error: `${boardMemberName} has already registered their +1 for this event.`,
        },
        { status: 400 }
      );
    }

    await appendTicketToAirtable(
      {
        firstName: guestFirstName.trim().slice(0, 500),
        lastName: guestLastName.trim().slice(0, 500),
        contactEmail: "",
        psuEmail: "",
        isMember: false,
        memberYear: null,
        eventId: event._id,
        eventName: event.title.slice(0, 500),
        ticketTypeKey: BOARD_PLUS_ONE_TICKET_TYPE_KEY,
        ticketTypeName: `Guest of ${boardMemberName}`.slice(0, 500),
        quantity: 1,
        amountPaidCents: 0,
        paymentMethod: "Card",
        paid: true,
        boardMemberName,
      },
      null
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Board +1 add error:", err);
    return NextResponse.json({ error: "Failed to add guest." }, { status: 500 });
  }
}

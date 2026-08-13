import { NextRequest, NextResponse } from "next/server";
import { getTicketRecordEventId, updateTicketCheckinState } from "@/lib/airtable";

export async function POST(
  req: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const { recordId, checkedIn, paid } = await req.json();

    if (typeof recordId !== "string" || !recordId) {
      return NextResponse.json({ error: "Missing recordId." }, { status: 400 });
    }

    const updates: { checkedIn?: boolean; paid?: boolean } = {};
    if (typeof checkedIn === "boolean") updates.checkedIn = checkedIn;
    if (typeof paid === "boolean") updates.paid = paid;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    // The middleware already confirmed the caller is authorized for
    // params.eventId — this confirms the record they're targeting actually
    // belongs to that event, so a session unlocked for one event can't
    // touch another event's tickets.
    const recordEventId = await getTicketRecordEventId(recordId);
    if (recordEventId !== params.eventId) {
      return NextResponse.json(
        { error: "Ticket does not belong to this event." },
        { status: 403 }
      );
    }

    await updateTicketCheckinState(recordId, updates);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Check-in mark error:", err);
    return NextResponse.json({ error: "Failed to update." }, { status: 500 });
  }
}

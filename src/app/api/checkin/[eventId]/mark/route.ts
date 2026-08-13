import { NextRequest, NextResponse } from "next/server";
import { getTicketRecordInfo, updateTicketCheckinState } from "@/lib/airtable";

export async function POST(
  req: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const { recordId, checkedInCount, paid } = await req.json();

    if (typeof recordId !== "string" || !recordId) {
      return NextResponse.json({ error: "Missing recordId." }, { status: 400 });
    }

    // The middleware already confirmed the caller is authorized for
    // params.eventId — this confirms the record they're targeting actually
    // belongs to that event, so a session unlocked for one event can't
    // touch another event's tickets. Also fetches quantity so checkedInCount
    // can be clamped to a valid range for this specific order.
    const info = await getTicketRecordInfo(recordId);
    if (!info || info.eventId !== params.eventId) {
      return NextResponse.json(
        { error: "Ticket does not belong to this event." },
        { status: 403 }
      );
    }

    const updates: { checkedInCount?: number; paid?: boolean } = {};

    if (checkedInCount !== undefined) {
      const count = Math.floor(Number(checkedInCount));
      if (!Number.isFinite(count) || count < 0 || count > info.quantity) {
        return NextResponse.json(
          { error: `checkedInCount must be between 0 and ${info.quantity}.` },
          { status: 400 }
        );
      }
      updates.checkedInCount = count;
    }
    if (typeof paid === "boolean") updates.paid = paid;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    await updateTicketCheckinState(recordId, updates);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Check-in mark error:", err);
    return NextResponse.json({ error: "Failed to update." }, { status: 500 });
  }
}

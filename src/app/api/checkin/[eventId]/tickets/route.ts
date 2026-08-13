import { NextRequest, NextResponse } from "next/server";
import { listTicketsForEvent } from "@/lib/airtable";

export async function GET(
  req: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const tickets = await listTicketsForEvent(params.eventId);
    return NextResponse.json({ tickets });
  } catch (err) {
    console.error("Check-in tickets fetch error:", err);
    return NextResponse.json(
      { error: "Failed to load tickets." },
      { status: 500 }
    );
  }
}

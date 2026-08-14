import { NextRequest, NextResponse } from "next/server";
import { hasUsedMemberPricing, lookupCurrentMember } from "@/lib/airtable";

// Read-only preview check the purchase form calls on PSU-email blur, so
// step 1 can show an accurate price before the buyer clicks Continue —
// the actual purchase routes always re-run this same logic server-side
// regardless of what this returns, so there's no trust issue in exposing it.
export async function POST(req: NextRequest) {
  try {
    const { eventId, psuEmail } = await req.json();

    if (typeof eventId !== "string" || !eventId) {
      return NextResponse.json({ error: "Missing event." }, { status: 400 });
    }

    const email = typeof psuEmail === "string" ? psuEmail.trim() : "";
    if (!email) {
      return NextResponse.json({ isMember: false, alreadyUsed: false });
    }

    const isMember = await lookupCurrentMember(email);
    const alreadyUsed = isMember ? await hasUsedMemberPricing(eventId, email) : false;

    return NextResponse.json({ isMember, alreadyUsed });
  } catch (err) {
    console.error("Member pricing check error:", err);
    return NextResponse.json({ error: "Failed to check pricing." }, { status: 500 });
  }
}

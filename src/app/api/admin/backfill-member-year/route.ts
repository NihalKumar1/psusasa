import { NextRequest, NextResponse } from "next/server";
import { backfillMemberYears } from "@/lib/airtable";

// One-time migration trigger for tickets bought before the "Member Year"
// Airtable column existed. Gated behind CHECKIN_SESSION_SECRET (an existing
// secret, reused here instead of adding a new env var) rather than left
// open, since it's a real write. Delete this route once the backfill has
// been run — it has nothing left to do after that.
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || key !== process.env.CHECKIN_SESSION_SECRET) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const result = await backfillMemberYears();
  return NextResponse.json(result);
}

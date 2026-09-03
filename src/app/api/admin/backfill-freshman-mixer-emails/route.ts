import { NextRequest, NextResponse } from "next/server";
import { listTicketsForEvent } from "@/lib/airtable";
import { sendTicketConfirmationEmail } from "@/lib/ticketEmail";

// One-time backfill: before commit 86b2143, the cash order route never sent
// a confirmation email for any order (by design — a real cash order isn't
// confirmed until paid at the door). Freshman Mixer's ticket type is $0 for
// both members and non-members, so "cash" buyers there got no email and had
// nothing left to pay, with no way to ever trigger one. After that fix, a
// $0 order — card or cash — is always stored as Payment Method "Card" (so
// the check-in board treats it identically, no cash-due badge). That makes
// the targeting exact: any row still stored as "Cash" for this event is
// unambiguously pre-fix and unambiguously never emailed. Delete this route
// once it's been run.
const FRESHMAN_MIXER_EVENT_ID = "61941198-921b-4f71-9d1b-9544ff2dc97f";
const FRESHMAN_MIXER_EVENT_NAME = "Freshman Mixer";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || key !== process.env.CHECKIN_SESSION_SECRET) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const tickets = await listTicketsForEvent(FRESHMAN_MIXER_EVENT_ID);
  const targets = tickets.filter(
    (t) => t.paymentMethod === "Cash" && t.amountPaidCents === 0
  );

  const results: Array<{ id: string; email: string; sent: boolean }> = [];
  let sent = 0;
  let skipped = 0;

  for (const t of targets) {
    if (!t.contactEmail) {
      skipped++;
      results.push({ id: t.id, email: t.contactEmail, sent: false });
      continue;
    }

    await sendTicketConfirmationEmail({
      contactEmail: t.contactEmail,
      firstName: t.firstName,
      eventName: FRESHMAN_MIXER_EVENT_NAME,
      ticketTypeName: t.ticketTypeName,
      quantity: t.quantity,
      amountPaidCents: t.amountPaidCents,
    });
    sent++;
    results.push({ id: t.id, email: t.contactEmail, sent: true });
  }

  return NextResponse.json({
    scanned: tickets.length,
    matched: targets.length,
    sent,
    skipped,
    results,
  });
}

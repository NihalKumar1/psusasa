import { NextRequest, NextResponse } from "next/server";
import {
  listTicketsAwaitingConfirmation,
  markConfirmationSent,
} from "@/lib/airtable";
import { sendTicketConfirmationEmail } from "@/lib/ticketEmail";
import { timingSafeEqual } from "@/lib/checkinAuth";

// One-time backfill. From commit 8928895 (Aug 13) until the sender fix in
// PR #48, every confirmation email 403'd — the app sent from Resend's shared
// onboarding@resend.dev testing domain, which only delivers to the account
// owner's own address. Nothing noticed, because the Resend SDK reports API
// errors through a returned `error` rather than by throwing, so the old code
// logged success on every rejection. Every ticket buyer in that window is
// still owed the email they were promised.
//
// The earlier Freshman Mixer backfill (96b159b) does not count as done: it
// ran while the 403 was still in force and reported sent: true regardless,
// because sendTicketConfirmationEmail returned nothing to check.
//
// Requires a "Confirmation Sent" (Checkbox) column on the Tickets table.
// That column is what makes this safely re-runnable and resumable — and what
// stops anyone being emailed twice. Delete this route once it's been run.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_LIMIT = 50;
// Resend allows 10 req/s per team, Airtable 5 req/s per base. 200ms sits
// comfortably under both — the deleted backfill looped with no delay at all.
const SEND_INTERVAL_MS = 200;
// Flush marks as we go, not once at the end: a timeout then loses at most
// this many marks instead of the whole run's worth.
const MARK_BATCH_SIZE = 10;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SendOutcome {
  id: string;
  contactEmail: string;
  eventName: string;
  sent: boolean;
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const secret = process.env.CHECKIN_SESSION_SECRET ?? "";
  if (!key || !secret || !timingSafeEqual(key, secret)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.floor(limitParam)
      : DEFAULT_LIMIT;

  let pending;
  try {
    pending = await listTicketsAwaitingConfirmation();
  } catch (err) {
    console.error("Backfill: failed to list pending confirmations:", err);
    return NextResponse.json(
      {
        error:
          "Failed to read Tickets. Does the 'Confirmation Sent' checkbox column exist?",
      },
      { status: 500 }
    );
  }

  const batch = pending.slice(0, limit);

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      scanned: pending.length,
      wouldSend: batch.length,
      remaining: pending.length,
      results: batch.map((t) => ({
        id: t.id,
        contactEmail: t.contactEmail,
        eventName: t.eventName,
        ticket: `${t.quantity}x ${t.ticketTypeName}`,
        amountPaidCents: t.amountPaidCents,
      })),
    });
  }

  const results: SendOutcome[] = [];
  let unflushed: string[] = [];
  let sent = 0;
  let failed = 0;

  async function flush() {
    if (unflushed.length === 0) return;
    await markConfirmationSent(unflushed);
    unflushed = [];
  }

  for (let i = 0; i < batch.length; i++) {
    const ticket = batch[i];
    if (i > 0) await delay(SEND_INTERVAL_MS);

    // Never throws — returns false and logs on any failure. A row that fails
    // stays unmarked and is picked up by the next run.
    const ok = await sendTicketConfirmationEmail({
      contactEmail: ticket.contactEmail,
      firstName: ticket.firstName,
      eventName: ticket.eventName,
      ticketTypeName: ticket.ticketTypeName,
      quantity: ticket.quantity,
      amountPaidCents: ticket.amountPaidCents,
    });

    results.push({
      id: ticket.id,
      contactEmail: ticket.contactEmail,
      eventName: ticket.eventName,
      sent: ok,
    });

    if (ok) {
      sent++;
      unflushed.push(ticket.id);
      if (unflushed.length >= MARK_BATCH_SIZE) {
        try {
          await flush();
        } catch (err) {
          // The emails did go out. Stop rather than risk re-sending them on
          // a later run with the marks still missing.
          console.error("Backfill: failed to mark a batch as sent:", err);
          return NextResponse.json(
            {
              error:
                "Emails were sent but marking them in Airtable failed — stopped to avoid double-sending. Check which rows have 'Confirmation Sent' set before re-running.",
              sent,
              failed,
              results,
            },
            { status: 500 }
          );
        }
      }
    } else {
      failed++;
    }
  }

  try {
    await flush();
  } catch (err) {
    console.error("Backfill: failed to mark the final batch as sent:", err);
    return NextResponse.json(
      {
        error:
          "Emails were sent but marking the final batch failed — stopped to avoid double-sending. Check which rows have 'Confirmation Sent' set before re-running.",
        sent,
        failed,
        results,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    dryRun: false,
    scanned: pending.length,
    attempted: batch.length,
    sent,
    failed,
    remaining: pending.length - sent,
    results,
  });
}

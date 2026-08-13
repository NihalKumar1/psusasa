"use client";

import { useEffect, useMemo, useState } from "react";
import type { TicketRecord } from "@/lib/airtable";

const POLL_INTERVAL_MS = 12000;

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// A cash order's price isn't split per-ticket in Airtable (member/non-member
// units can differ), so once some but not all of a party has checked in,
// this is a proportional estimate of what's still owed — not penny-exact,
// but good enough for staff to know roughly what to ask for. Manually
// marking an order "paid" always overrides this to $0, for the "they paid
// for everyone up front" case.
function amountOwedCents(t: TicketRecord): number {
  if (t.paymentMethod !== "Cash" || t.paid || t.quantity <= 0) return 0;
  return Math.round((t.amountPaidCents * (t.quantity - t.checkedInCount)) / t.quantity);
}

interface CheckinBoardProps {
  eventId: string;
  eventTitle: string;
  initialTickets: TicketRecord[];
}

export default function CheckinBoard({
  eventId,
  eventTitle,
  initialTickets,
}: CheckinBoardProps) {
  const [tickets, setTickets] = useState<TicketRecord[]>(initialTickets);
  const [search, setSearch] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refetch() {
    try {
      const res = await fetch(`/api/checkin/${eventId}/tickets`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.tickets)) setTickets(data.tickets);
    } catch {
      // next poll will retry
    }
  }

  // Multiple staff devices are likely at the door at once — poll so
  // check-ins from other devices show up without a manual refresh.
  useEffect(() => {
    const id = setInterval(refetch, POLL_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function sendMark(
    recordId: string,
    updates: { checkedInCount?: number; paid?: boolean }
  ) {
    setPendingId(recordId);
    setError(null);
    setTickets((prev) =>
      prev.map((t): TicketRecord =>
        t.id === recordId
          ? {
              ...t,
              checkedInCount: updates.checkedInCount ?? t.checkedInCount,
              paid: updates.paid ?? t.paid,
            }
          : t
      )
    );
    try {
      const res = await fetch(`/api/checkin/${eventId}/mark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, ...updates }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update.");
      refetch(); // revert any optimistic update that didn't actually land
    } finally {
      setPendingId(null);
    }
  }

  // Reaching full check-in on a cash order also marks it Paid — the "owed"
  // badge already implies $0 once everyone's in, this makes that actually
  // land in Airtable instead of just being a display quirk. One-directional:
  // stepping back down never un-marks Paid, since undoing a check-in
  // mistake doesn't mean the cash was handed back.
  function checkinUpdates(
    ticket: TicketRecord,
    nextCount: number
  ): { checkedInCount: number; paid?: boolean } {
    const updates: { checkedInCount: number; paid?: boolean } = {
      checkedInCount: nextCount,
    };
    if (nextCount >= ticket.quantity && ticket.paymentMethod === "Cash" && !ticket.paid) {
      updates.paid = true;
    }
    return updates;
  }

  // Single-ticket orders keep the simple whole-row tap-to-toggle.
  function handleTap(ticket: TicketRecord) {
    const nextCount = ticket.checkedInCount > 0 ? 0 : 1;
    sendMark(ticket.id, checkinUpdates(ticket, nextCount));
  }

  // Multi-ticket orders use +/- instead of a whole-row tap, since check-in
  // isn't all-or-nothing when a party can arrive (and pay) in stages.
  function incrementCheckedIn(ticket: TicketRecord) {
    if (ticket.checkedInCount >= ticket.quantity) return;
    sendMark(ticket.id, checkinUpdates(ticket, ticket.checkedInCount + 1));
  }

  function decrementCheckedIn(ticket: TicketRecord) {
    if (ticket.checkedInCount <= 0) return;
    sendMark(ticket.id, { checkedInCount: ticket.checkedInCount - 1 });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter((t) =>
      `${t.firstName} ${t.lastName} ${t.contactEmail} ${t.psuEmail}`
        .toLowerCase()
        .includes(q)
    );
  }, [tickets, search]);

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
      ),
    [filtered]
  );

  const stats = useMemo(() => {
    let totalSold = 0;
    let totalCheckedIn = 0;
    let memberSold = 0;
    let nonMemberSold = 0;
    let cashOutstandingCents = 0;
    const byType = new Map<string, { sold: number; checkedIn: number }>();

    for (const t of tickets) {
      totalSold += t.quantity;
      totalCheckedIn += t.checkedInCount;
      if (t.isMember) memberSold += t.quantity;
      else nonMemberSold += t.quantity;
      cashOutstandingCents += amountOwedCents(t);

      const entry = byType.get(t.ticketTypeName) ?? { sold: 0, checkedIn: 0 };
      entry.sold += t.quantity;
      entry.checkedIn += t.checkedInCount;
      byType.set(t.ticketTypeName, entry);
    }

    return {
      totalSold,
      totalCheckedIn,
      memberSold,
      nonMemberSold,
      cashOutstandingCents,
      byType: Array.from(byType.entries()),
    };
  }, [tickets]);

  return (
    <div>
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
        <h1 className="font-heading text-lg font-semibold text-sasa-red-900">
          {eventTitle}
        </h1>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Checked In" value={`${stats.totalCheckedIn} / ${stats.totalSold}`} />
          <Stat label="Members" value={String(stats.memberSold)} />
          <Stat label="Non-Members" value={String(stats.nonMemberSold)} />
          <Stat
            label="Cash Outstanding"
            value={formatPrice(stats.cashOutstandingCents)}
            warn={stats.cashOutstandingCents > 0}
          />
        </div>
        {stats.byType.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sasa-neutral-500">
            {stats.byType.map(([name, s]) => (
              <span key={name}>
                {name}: {s.checkedIn}/{s.sold}
              </span>
            ))}
          </div>
        )}
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or email..."
        className="mb-4 w-full rounded border border-gray-300 px-4 py-3 text-base focus:border-sasa-red-900 focus:outline-none focus:ring-1 focus:ring-sasa-red-900"
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {sorted.length === 0 && (
          <p className="py-8 text-center text-sm text-sasa-neutral-400">
            No matching orders.
          </p>
        )}
        {sorted.map((t) => {
          const owedCents = amountOwedCents(t);
          const isPending = pendingId === t.id;
          const isSingle = t.quantity === 1;
          const fullyCheckedIn = t.checkedInCount >= t.quantity;
          const partiallyCheckedIn = t.checkedInCount > 0 && !fullyCheckedIn;

          return (
            <div
              key={t.id}
              role={isSingle ? "button" : undefined}
              tabIndex={isSingle ? 0 : undefined}
              onClick={isSingle ? () => !isPending && handleTap(t) : undefined}
              onKeyDown={
                isSingle
                  ? (e) => {
                      if ((e.key === "Enter" || e.key === " ") && !isPending) {
                        e.preventDefault();
                        handleTap(t);
                      }
                    }
                  : undefined
              }
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                isSingle ? "cursor-pointer" : ""
              } ${
                fullyCheckedIn
                  ? "border-sasa-gold-600/40 bg-sasa-gold-400/10"
                  : partiallyCheckedIn
                    ? "border-sasa-gold-600/20 bg-sasa-gold-400/5"
                    : "border-gray-200 bg-white hover:border-sasa-red-900/30"
              } ${isPending ? "opacity-50" : ""}`}
            >
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sasa-red-900">
                    {t.firstName} {t.lastName}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.isMember
                        ? "bg-sasa-forest/10 text-sasa-forest"
                        : "bg-gray-100 text-sasa-neutral-500"
                    }`}
                  >
                    {t.isMember ? "Member" : "Non-Member"}
                  </span>
                  {owedCents > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Owes {formatPrice(owedCents)}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-sasa-neutral-500">
                  {t.quantity}x {t.ticketTypeName}
                  {t.contactEmail ? ` · ${t.contactEmail}` : ""}
                </div>
              </div>

              {t.paymentMethod === "Cash" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isPending) sendMark(t.id, { paid: !t.paid });
                  }}
                  disabled={isPending}
                  className="shrink-0 whitespace-nowrap text-xs font-medium text-sasa-neutral-500 underline decoration-dotted disabled:opacity-50"
                >
                  Mark {t.paid ? "unpaid" : "paid"}
                </button>
              )}

              {isSingle ? (
                <span
                  className={`shrink-0 rounded px-4 py-2 text-sm font-semibold ${
                    fullyCheckedIn
                      ? "bg-sasa-gold-600 text-sasa-red-900"
                      : "bg-sasa-red-900 text-white"
                  }`}
                >
                  {fullyCheckedIn ? "Checked In ✓" : "Check In"}
                </span>
              ) : (
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => decrementCheckedIn(t)}
                    disabled={isPending || t.checkedInCount <= 0}
                    aria-label="Decrease checked-in count"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-lg font-semibold text-sasa-red-900 hover:bg-gray-50 disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="min-w-[3.5rem] text-center text-sm font-semibold text-sasa-red-900">
                    {t.checkedInCount} / {t.quantity}
                  </span>
                  <button
                    onClick={() => incrementCheckedIn(t)}
                    disabled={isPending || t.checkedInCount >= t.quantity}
                    aria-label="Increase checked-in count"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-lg font-semibold text-sasa-red-900 hover:bg-gray-50 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-sasa-neutral-400">{label}</p>
      <p className={`text-lg font-semibold ${warn ? "text-amber-600" : "text-sasa-red-900"}`}>
        {value}
      </p>
    </div>
  );
}

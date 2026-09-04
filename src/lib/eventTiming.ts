// When ticket sales stop, in one place. Used by the purchase routes (via
// resolveTicketOrder), the event page's Buy Tickets CTA, and the tickets page
// itself, so a closed event can't be open in one of them and shut in another.

/** How long an event is assumed to run when Studio has no end time on it. */
const ASSUMED_EVENT_LENGTH_MS = 6 * 60 * 60 * 1000;

/**
 * Sales close when the event is over — at `endDate` when one is set, and
 * otherwise `ASSUMED_EVENT_LENGTH_MS` after the start.
 *
 * The fallback exists because `date` is the *start*: closing there would stop
 * selling the moment doors open, and people do buy while standing in line.
 * Erring long is the safe direction — the far worse failure is the one this
 * replaced, where last spring's show stayed purchasable indefinitely unless a
 * board member remembered to untoggle ticketing.
 */
export function ticketSalesClosed(
  event: { date?: string; endDate?: string },
  now: Date = new Date()
): boolean {
  const closesAt = ticketSalesCloseAt(event);
  // No usable date on the event: don't invent a closure. Ticketing is still
  // gated by `ticketingEnabled` and `salesOpen`.
  if (closesAt === null) return false;
  return now.getTime() > closesAt;
}

/** Sales cutoff as a timestamp, or null if the event carries no valid date. */
export function ticketSalesCloseAt(event: {
  date?: string;
  endDate?: string;
}): number | null {
  const end = event.endDate ? Date.parse(event.endDate) : NaN;
  if (Number.isFinite(end)) return end;

  const start = event.date ? Date.parse(event.date) : NaN;
  if (Number.isFinite(start)) return start + ASSUMED_EVENT_LENGTH_MS;

  return null;
}

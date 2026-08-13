import { sanityFetchSingle } from "../../sanity/lib/client";
import { eventByIdQuery } from "../../sanity/lib/queries";
import type { SanityEvent, TicketType } from "@/lib/types";
import { lookupCurrentMember, sumSoldTicketQuantity } from "@/lib/airtable";

export const MAX_TICKETS_PER_ORDER = 10;

export class TicketOrderError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface TicketOrderInput {
  eventId: unknown;
  ticketTypeKey: unknown;
  quantity: unknown;
  psuEmail?: unknown;
}

export interface ResolvedTicketOrder {
  event: SanityEvent;
  ticketType: TicketType;
  quantity: number;
  isMember: boolean;
  unitPriceCents: number;
  subtotalCents: number;
}

// Shared by both the card and cash purchase routes: validates the request,
// re-fetches the event fresh from Sanity (never trust client-supplied
// prices), verifies membership, and enforces capacity. Keeping this in one
// place means the two payment paths can't silently drift out of sync.
export async function resolveTicketOrder({
  eventId,
  ticketTypeKey,
  quantity,
  psuEmail,
}: TicketOrderInput): Promise<ResolvedTicketOrder> {
  if (typeof eventId !== "string" || !eventId) {
    throw new TicketOrderError("Missing event.");
  }
  if (typeof ticketTypeKey !== "string" || !ticketTypeKey) {
    throw new TicketOrderError("Missing ticket type.");
  }

  const qty = Math.floor(Number(quantity));
  if (!Number.isFinite(qty) || qty < 1 || qty > MAX_TICKETS_PER_ORDER) {
    throw new TicketOrderError(
      `Quantity must be between 1 and ${MAX_TICKETS_PER_ORDER}.`
    );
  }

  const event = await sanityFetchSingle<SanityEvent>(eventByIdQuery, {
    id: eventId,
  });
  if (!event) throw new TicketOrderError("Event not found.", 404);
  if (!event.ticketingEnabled) {
    throw new TicketOrderError("Ticket sales are not open for this event.");
  }

  const ticketType = event.ticketTypes?.find((t) => t._key === ticketTypeKey);
  if (!ticketType) throw new TicketOrderError("Ticket type not found.", 404);
  if (ticketType.salesOpen === false) {
    throw new TicketOrderError("This ticket type is no longer on sale.");
  }

  const emailInput = typeof psuEmail === "string" ? psuEmail.trim() : "";
  const isMember = emailInput ? await lookupCurrentMember(emailInput) : false;
  const unitPriceCents = isMember
    ? ticketType.memberPriceCents
    : ticketType.nonMemberPriceCents;

  if (typeof ticketType.capacity === "number") {
    const sold = await sumSoldTicketQuantity(event._id, ticketType._key);
    const remaining = ticketType.capacity - sold;
    if (qty > remaining) {
      throw new TicketOrderError(
        remaining > 0
          ? `Only ${remaining} ticket(s) left for ${ticketType.name}.`
          : `${ticketType.name} is sold out.`
      );
    }
  }

  return {
    event,
    ticketType,
    quantity: qty,
    isMember,
    unitPriceCents,
    subtotalCents: unitPriceCents * qty,
  };
}

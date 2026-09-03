import { sanityFetchSingle } from "../../sanity/lib/client";
import { eventByIdQuery } from "../../sanity/lib/queries";
import type { SanityEvent, TicketType } from "@/lib/types";
import {
  hasUsedMemberPricing,
  lookupCurrentMember,
  sumSoldTicketQuantity,
} from "@/lib/airtable";

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
  /** Raw membership-verification result, independent of discount eligibility. */
  isCurrentMember: boolean;
  /** True if this order's buyer-unit was priced at the member rate. */
  isMember: boolean;
  /** The buyer's Members-table "Year", when isMember is true — otherwise null. */
  memberYear: string | null;
  /** Always 0 or 1 — at most one seat per order/person ever gets member pricing. */
  memberUnits: number;
  nonMemberUnits: number;
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
  const { isMember: isCurrentMember, year: currentMemberYear } = emailInput
    ? await lookupCurrentMember(emailInput)
    : { isMember: false, year: null };

  // At most 1 ticket per person, ever, gets the member price for a given
  // event — the buyer's own seat, and only if they haven't already used
  // that allowance in an earlier order. Any additional tickets in this
  // order (for friends/guests) are charged at the non-member rate
  // regardless of quantity — buying in bulk can't stack the discount.
  const alreadyUsedMemberPricing = isCurrentMember
    ? await hasUsedMemberPricing(event._id, emailInput)
    : false;
  const memberUnits = isCurrentMember && !alreadyUsedMemberPricing ? 1 : 0;
  const nonMemberUnits = qty - memberUnits;
  const subtotalCents =
    memberUnits * ticketType.memberPriceCents +
    nonMemberUnits * ticketType.nonMemberPriceCents;

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
    isCurrentMember,
    isMember: memberUnits > 0,
    memberYear: memberUnits > 0 ? currentMemberYear : null,
    memberUnits,
    nonMemberUnits,
    subtotalCents,
  };
}

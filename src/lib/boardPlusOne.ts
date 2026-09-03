// Synthetic ticket-type key for a board member's comped +1 guest — never
// looked up from event.ticketTypes, never collides with a real Sanity
// ticket type's random _key. Shared between the board-plus-one API route
// and CheckinBoard.tsx so neither has to import from the other.
export const BOARD_PLUS_ONE_TICKET_TYPE_KEY = "board-plus-one";

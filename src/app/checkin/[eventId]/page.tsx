import { notFound } from "next/navigation";
import { sanityFetchSingle } from "../../../../sanity/lib/client";
import {
  eventByIdQuery,
  boardMembersPickerQuery,
} from "../../../../sanity/lib/queries";
import type { SanityEvent, BoardMemberPickerEntry } from "@/lib/types";
import { listTicketsForEvent } from "@/lib/airtable";
import CheckinBoard from "@/components/checkin/CheckinBoard";

// The middleware has already confirmed the caller is authorized for this
// eventId by the time this page renders — no auth check needed here.
export const dynamic = "force-dynamic";

interface CheckinEventPageProps {
  params: { eventId: string };
}

export default async function CheckinEventPage({
  params,
}: CheckinEventPageProps) {
  const event = await sanityFetchSingle<SanityEvent>(eventByIdQuery, {
    id: params.eventId,
  });

  if (!event) notFound();

  const tickets = await listTicketsForEvent(params.eventId);

  let boardMembers: BoardMemberPickerEntry[] = [];
  if (event.boardPlusOneEnabled) {
    const roster = await sanityFetchSingle<{ members?: BoardMemberPickerEntry[] }>(
      boardMembersPickerQuery
    );
    boardMembers = roster?.members ?? [];
  }

  return (
    <CheckinBoard
      eventId={params.eventId}
      eventTitle={event.title}
      initialTickets={tickets}
      boardPlusOneEnabled={Boolean(event.boardPlusOneEnabled)}
      boardMembers={boardMembers}
    />
  );
}

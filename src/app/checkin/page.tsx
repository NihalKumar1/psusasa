import Link from "next/link";
import { sanityFetch } from "../../../sanity/lib/client";
import { ticketedEventsQuery } from "../../../sanity/lib/queries";

// Live list of ticketed events for staff to pick from before logging in to
// a specific event's board. Left unauthenticated — event names/dates are
// already public on the site, and staff need this to know where to go.
export const dynamic = "force-dynamic";

const CHECKIN_PICKER_GRACE_MS = 48 * 60 * 60 * 1000;

interface TicketedEvent {
  _id: string;
  title: string;
  date: string;
}

export default async function CheckinPickerPage() {
  // A grace window, not a hard "future events only" cut: boards get reconciled
  // the morning after, so an event stays pickable for two days past its end.
  // /checkin/[eventId] itself stays ungated — an old board is still reachable
  // by direct link.
  const cutoff = new Date(
    Date.now() - CHECKIN_PICKER_GRACE_MS
  ).toISOString();
  const events = await sanityFetch<TicketedEvent>(ticketedEventsQuery, {
    cutoff,
  });

  return (
    <div>
      <h1 className="mb-6 font-heading text-2xl font-bold text-sasa-red-900">
        Select an Event
      </h1>
      {events.length === 0 ? (
        <p className="text-sm text-sasa-neutral-500">
          No current ticketed events. Turn on ticketing for an upcoming event in
          Studio — events drop off this list two days after they end.
        </p>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <Link
              key={event._id}
              href={`/checkin/${event._id}`}
              className="block rounded-lg border border-gray-200 bg-white px-4 py-3 transition-colors hover:border-sasa-red-900/40"
            >
              <p className="font-medium text-sasa-red-900">{event.title}</p>
              <p className="text-xs text-sasa-neutral-500">
                {new Date(event.date).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "America/New_York",
                })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

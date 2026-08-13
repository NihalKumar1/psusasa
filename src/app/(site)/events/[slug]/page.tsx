import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sanityFetch, sanityFetchSingle } from "../../../../../sanity/lib/client";
import { urlFor } from "../../../../../sanity/lib/image";
import {
  eventBySlugQuery,
  allEventsQuery,
} from "../../../../../sanity/lib/queries";
import type { SanityEvent } from "@/lib/types";

interface EventPageProps {
  params: { slug: string };
}

export async function generateStaticParams() {
  const events = await sanityFetch<SanityEvent>(allEventsQuery);
  return events.map((event) => ({ slug: event.slug.current }));
}

export async function generateMetadata({
  params,
}: EventPageProps): Promise<Metadata> {
  const event = await sanityFetchSingle<SanityEvent>(eventBySlugQuery, {
    slug: params.slug,
  });
  if (!event) return { title: "Event Not Found | SASA" };
  return {
    title: `${event.title} | SASA at Penn State`,
    description: event.description || `${event.title} — a SASA event`,
    alternates: { canonical: `/events/${params.slug}` },
  };
}

export const revalidate = 60;

export default async function EventDetailPage({ params }: EventPageProps) {
  const event = await sanityFetchSingle<SanityEvent>(eventBySlugQuery, {
    slug: params.slug,
  });

  if (!event) notFound();

  const start = new Date(event.date);
  const end =
    event.endDate && !event.hideEndTime ? new Date(event.endDate) : null;

  const TIME_ZONE = "America/New_York";

  const formattedDate = start.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: TIME_ZONE,
  });

  const timeFormat: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  };

  const dayKey = (d: Date) =>
    d.toLocaleDateString("en-US", { timeZone: TIME_ZONE });
  const sameDay = end && dayKey(start) === dayKey(end);

  const formattedTime = end
    ? sameDay
      ? `${start.toLocaleTimeString("en-US", timeFormat)} – ${end.toLocaleTimeString("en-US", timeFormat)}`
      : `${start.toLocaleTimeString("en-US", timeFormat)} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TIME_ZONE })}, ${end.toLocaleTimeString("en-US", timeFormat)}`
    : start.toLocaleTimeString("en-US", timeFormat);

  const showLocation = Boolean(event.location && !event.hideLocation);

  function getTextColor(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > 0.5 ? "#1a1a1a" : "#ffffff";
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: start.toISOString(),
    ...(end ? { endDate: end.toISOString() } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    ...(showLocation
      ? { location: { "@type": "Place", name: event.location } }
      : {}),
    description: event.description ?? `${event.title} — a SASA event`,
    ...(event.coverImage
      ? { image: [urlFor(event.coverImage).width(1200).height(675).url()] }
      : {}),
    organizer: {
      "@type": "Organization",
      name: "Penn State SASA",
      url: "https://psusasa.com",
    },
    url: `https://psusasa.com/events/${params.slug}`,
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Back link */}
      <div className="bg-gray-50 py-4">
        <div className="mx-auto max-w-4xl px-4">
          <Link
            href="/events"
            className="inline-flex items-center gap-1 text-sm text-sasa-neutral-500 hover:text-sasa-red-900"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Events
          </Link>
        </div>
      </div>

      <article className="py-12">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          {/* Cover Image */}
          {event.coverImage && (
            <div className="relative mb-8 aspect-[16/9] overflow-hidden rounded-2xl">
              <Image
                src={urlFor(event.coverImage).width(1200).height(675).url()}
                alt={event.title}
                fill
                className="object-cover"
                priority
              />
            </div>
          )}

          {/* Category badge */}
          {event.category && (
            <span
              className="inline-block rounded-full px-4 py-1 text-sm font-semibold"
              style={{
                backgroundColor: event.category.color,
                color: getTextColor(event.category.color),
              }}
            >
              {event.category.name}
            </span>
          )}

          {/* Title */}
          <h1 className="mt-4 font-heading text-3xl font-bold text-sasa-red-900 sm:text-4xl">
            {event.title}
          </h1>

          {/* Date & Time */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sasa-neutral-500">
            <div className="flex items-center gap-2">
              <svg
                className="h-5 w-5 text-sasa-gold-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                />
              </svg>
              <span>{formattedDate}</span>
            </div>
            <div className="flex items-center gap-2">
              <svg
                className="h-5 w-5 text-sasa-gold-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{formattedTime}</span>
            </div>
            {showLocation && (
              <div className="flex items-center gap-2">
                <svg
                  className="h-5 w-5 text-sasa-gold-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                  />
                </svg>
                <span>{event.location}</span>
              </div>
            )}
          </div>

          {/* Buy Tickets CTA */}
          {event.ticketingEnabled && event.ticketTypes && event.ticketTypes.length > 0 && (
            <div className="mt-6">
              <Link
                href={`/events/${params.slug}/tickets`}
                className="inline-block rounded bg-sasa-red-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-sasa-red-700"
              >
                Buy Tickets
              </Link>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div className="mt-8 rounded-xl border border-gray-100 bg-gray-50 p-6">
              <p className="whitespace-pre-wrap text-lg leading-relaxed text-sasa-neutral-500">
                {event.description}
              </p>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

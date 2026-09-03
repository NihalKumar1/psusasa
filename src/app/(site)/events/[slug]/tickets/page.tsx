import type { Metadata } from "next";
import dynamicImport from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sanityFetchSingle } from "../../../../../../sanity/lib/client";
import { eventBySlugQuery } from "../../../../../../sanity/lib/queries";
import { urlFor } from "../../../../../../sanity/lib/image";
import type { SanityEvent } from "@/lib/types";
import { sumSoldTicketQuantity } from "@/lib/airtable";
import type { TicketTypeOption } from "@/components/tickets/TicketPurchaseForm";

const TicketPurchaseForm = dynamicImport(
  () => import("@/components/tickets/TicketPurchaseForm"),
  { ssr: false }
);

// Ticket availability must be live (capacity/sales status can change any
// minute), never ISR-cached.
export const dynamic = "force-dynamic";

interface TicketsPageProps {
  params: { slug: string };
}

export async function generateMetadata({
  params,
}: TicketsPageProps): Promise<Metadata> {
  const event = await sanityFetchSingle<SanityEvent>(eventBySlugQuery, {
    slug: params.slug,
  });
  if (!event) return { title: "Tickets Not Found | SASA" };
  return {
    title: `Tickets — ${event.title} | SASA at Penn State`,
    robots: { index: false, follow: false },
  };
}

export default async function EventTicketsPage({ params }: TicketsPageProps) {
  const event = await sanityFetchSingle<SanityEvent>(eventBySlugQuery, {
    slug: params.slug,
  });

  const ticketTypesList = event?.ticketTypes;
  if (!event || !event.ticketingEnabled || !ticketTypesList || ticketTypesList.length === 0) {
    notFound();
  }

  const ticketTypes: TicketTypeOption[] = await Promise.all(
    ticketTypesList.map(async (t) => {
      let remaining: number | null = null;
      if (typeof t.capacity === "number") {
        const sold = await sumSoldTicketQuantity(event._id, t._key);
        remaining = Math.max(0, t.capacity - sold);
      }
      return {
        _key: t._key,
        name: t.name,
        memberPriceCents: t.memberPriceCents,
        nonMemberPriceCents: t.nonMemberPriceCents,
        salesOpen: t.salesOpen !== false,
        remaining,
      };
    })
  );

  const TIME_ZONE = "America/New_York";
  const start = new Date(event.date);
  const formattedDate = start.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: TIME_ZONE,
  });
  const formattedTime = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
  const showLocation = Boolean(event.location && !event.hideLocation);

  return (
    <div>
      <div className="bg-gray-50 py-4">
        <div className="mx-auto max-w-3xl px-4">
          <Link
            href={`/events/${params.slug}`}
            className="inline-flex items-center gap-1 text-sm text-sasa-neutral-500 hover:text-sasa-red-900"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to {event.title}
          </Link>
        </div>
      </div>

      <section className="relative overflow-hidden bg-sasa-red-900 py-16">
        {event.coverImage && (
          <>
            <Image
              src={urlFor(event.coverImage).width(1600).height(700).url()}
              alt=""
              fill
              className="object-cover opacity-25"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-b from-sasa-red-900/80 via-sasa-red-900/85 to-sasa-red-900" />
          </>
        )}
        <div className="relative mx-auto max-w-3xl px-4 text-center">
          <div className="hero-paisley-overlay" />
          <div className="relative z-10">
            <span className="inline-block rounded-full bg-sasa-gold-400/15 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-sasa-gold-400">
              Get Tickets
            </span>
            <h1 className="mt-4 font-heading text-3xl font-bold text-white sm:text-4xl">
              {event.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm text-white/80">
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4 text-sasa-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                  />
                </svg>
                {formattedDate} · {formattedTime}
              </span>
              {showLocation && (
                <span className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 text-sasa-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                  {event.location}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <TicketPurchaseForm
            eventId={event._id}
            eventSlug={params.slug}
            ticketTypes={ticketTypes}
            cashPaymentEnabled={event.cashPaymentEnabled !== false}
          />
        </div>
      </section>
    </div>
  );
}

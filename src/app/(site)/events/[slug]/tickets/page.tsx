import type { Metadata } from "next";
import dynamicImport from "next/dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sanityFetchSingle } from "../../../../../../sanity/lib/client";
import { eventBySlugQuery } from "../../../../../../sanity/lib/queries";
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

      <section className="bg-sasa-red-900 py-16">
        <div className="relative mx-auto max-w-3xl px-4 text-center">
          <div className="hero-paisley-overlay" />
          <div className="relative z-10">
            <h1 className="font-heading text-3xl font-bold text-white sm:text-4xl">
              Get Tickets
            </h1>
            <p className="mt-3 text-lg text-white/80">{event.title}</p>
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <TicketPurchaseForm
            eventId={event._id}
            eventSlug={params.slug}
            ticketTypes={ticketTypes}
          />
        </div>
      </section>
    </div>
  );
}

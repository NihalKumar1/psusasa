import type { Metadata } from "next";
import Link from "next/link";
import Stripe from "stripe";
import { appendTicketToAirtable } from "@/lib/airtable";
import { sendTicketConfirmationEmail } from "@/lib/ticketEmail";

export const metadata: Metadata = {
  title: "Tickets | SASA at Penn State",
  robots: { index: false, follow: false },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface TicketsReturnPageProps {
  params: { slug: string };
  searchParams: { payment_intent?: string };
}

export default async function TicketsReturnPage({
  params,
  searchParams,
}: TicketsReturnPageProps) {
  const paymentIntentId = searchParams.payment_intent;

  if (!paymentIntentId) {
    return (
      <ErrorState slug={params.slug} />
    );
  }

  let paymentIntent: Stripe.PaymentIntent | null = null;
  try {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (err) {
    console.error("Error retrieving ticket payment intent:", err);
  }

  const isComplete = paymentIntent?.status === "succeeded";
  const m: Record<string, string> = paymentIntent?.metadata ?? {};

  // Always show what Stripe actually charged, never a re-derived price.
  const amountCents = paymentIntent?.amount ?? 0;
  const isMember = m.isMember === "true";
  const eventName = m.eventName ?? "your event";
  const ticketTypeName = m.ticketTypeName ?? "Ticket";
  const quantity = Number(m.quantity) || 1;
  const memberUnits = Number(m.memberUnits) || 0;
  const nonMemberUnits = Number(m.nonMemberUnits) || quantity;
  const priceLabel = [
    memberUnits > 0 ? `${memberUnits} at member price` : null,
    nonMemberUnits > 0 ? `${nonMemberUnits} at non-member price` : null,
  ]
    .filter(Boolean)
    .join(" + ");

  if (isComplete) {
    try {
      const { inserted } = await appendTicketToAirtable(
        {
          firstName: m.firstName ?? "",
          lastName: m.lastName ?? "",
          contactEmail: m.contactEmail ?? "",
          psuEmail: m.psuEmail ?? "",
          isMember,
          memberYear: m.memberYear || null,
          eventId: m.eventId ?? "",
          eventName,
          ticketTypeKey: m.ticketTypeKey ?? "",
          ticketTypeName,
          quantity,
          amountPaidCents: amountCents,
          paymentMethod: "Card",
          paid: true,
          boardMemberName: null,
        },
        paymentIntent!.id
      );

      // Only the write that actually lands sends the email — the webhook
      // and this page both call appendTicketToAirtable for the same order,
      // and `inserted` is false for whichever one loses the race.
      if (inserted) {
        await sendTicketConfirmationEmail({
          contactEmail: m.contactEmail ?? "",
          firstName: m.firstName ?? "",
          eventName,
          ticketTypeName,
          quantity,
          amountPaidCents: amountCents,
        });
      }
    } catch (err) {
      console.error("Ticket Airtable write failed:", err);
    }
  }

  return (
    <div>
      <section className="bg-sasa-red-900 py-16">
        <div className="relative mx-auto max-w-3xl px-4 text-center">
          <div className="hero-paisley-overlay" />
          <div className="relative z-10">
            <h1 className="font-heading text-4xl font-bold text-white sm:text-5xl">
              {isComplete ? "You're going!" : "Payment Status"}
            </h1>
          </div>
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          {isComplete ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
              <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-sasa-gold-400/20">
                <svg
                  className="h-10 w-10 text-sasa-gold-600"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M20.293 5.293a1 1 0 011.414 1.414l-10 10a1 1 0 01-1.414 0l-6-6a1 1 0 011.414-1.414L10 14.586l9.293-9.293z" />
                </svg>
              </div>

              <h2 className="mb-3 font-heading text-2xl font-bold text-sasa-red-900">
                {quantity}x {ticketTypeName}
              </h2>
              <p className="mb-1 text-sasa-neutral-500">{eventName}</p>
              <p className="mb-6 text-sasa-neutral-500">
                You paid {formatPrice(amountCents)} ({priceLabel}). A
                confirmation email will be sent to the address you provided.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Link
                  href={`/events/${params.slug}`}
                  className="inline-block rounded bg-sasa-red-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-sasa-red-700"
                >
                  Back to Event
                </Link>
                <Link
                  href="/events"
                  className="inline-block rounded border-2 border-sasa-gold-400 px-6 py-3 text-sm font-semibold text-sasa-gold-400 transition-colors hover:bg-sasa-gold-400/10"
                >
                  See Upcoming Events
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border-2 border-yellow-200 bg-yellow-50 p-6 text-center">
              <p className="mb-4 text-yellow-700">
                Your payment is still processing or was not completed.
              </p>
              <Link
                href={`/events/${params.slug}/tickets`}
                className="inline-block rounded bg-sasa-red-900 px-6 py-2 text-sm font-semibold text-white hover:bg-sasa-red-700"
              >
                Try Again
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ErrorState({ slug }: { slug: string }) {
  return (
    <div>
      <section className="bg-sasa-red-900 py-16">
        <div className="relative mx-auto max-w-3xl px-4 text-center">
          <div className="hero-paisley-overlay" />
          <div className="relative z-10">
            <h1 className="font-heading text-4xl font-bold text-white sm:text-5xl">
              Tickets
            </h1>
          </div>
        </div>
      </section>
      <section className="bg-white py-16">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-xl border-2 border-red-200 bg-red-50 p-6 text-center text-red-700">
            <p>
              Something went wrong. Please{" "}
              <Link href={`/events/${slug}/tickets`} className="font-semibold underline">
                try again
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

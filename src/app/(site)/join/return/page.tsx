import type { Metadata } from "next";
import Link from "next/link";
import Stripe from "stripe";
import { appendMemberToAirtable } from "@/lib/airtable";
import ClearSavedForm from "@/components/join/ClearSavedForm";
import PortableTextRenderer from "@/components/sanity/PortableTextRenderer";
import { sanityFetchSingle } from "../../../../../sanity/lib/client";
import {
  membershipConfirmationQuery,
  membershipFormCopyQuery,
} from "../../../../../sanity/lib/queries";
import type {
  MembershipConfirmationCopy,
  MembershipFormCopy,
} from "../../../../../sanity/lib/types";
import type { PortableTextBlock } from "@portabletext/types";

export const metadata: Metadata = {
  title: "Welcome | SASA at Penn State",
  description: "You're officially a SASA member!",
  robots: { index: false, follow: false },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// --- Fallbacks ---------------------------------------------------------------

const FALLBACK_PRICE_CENTS = 3500;

const FALLBACK_SUCCESS_HERO = "You're officially a SASA member!";
const FALLBACK_SUCCESS_CARD_TITLE = "Welcome to SASA!";
const FALLBACK_SUCCESS_NEXT_STEPS_HEADING = "Next steps:";

const FALLBACK_PENDING_HERO = "Payment Status";
const FALLBACK_PENDING_MESSAGE =
  "Your payment is still processing or was not completed.";
const FALLBACK_PENDING_RETRY_LABEL = "Try Again";
const FALLBACK_PENDING_RETRY_HREF = "/join";

const FALLBACK_ERROR_HERO = "Join SASA";

function fallbackSuccessBody(price: string) {
  return (
    <p className="mb-4 text-sasa-neutral-500">
      Your {price} membership payment was successful. A confirmation email will
      be sent to the PSU email you provided.
    </p>
  );
}

const FALLBACK_NEXT_STEPS = [
  {
    text: "Follow us on Instagram:",
    linkLabel: "@psusasa",
    linkHref: "https://instagram.com/psusasa",
  },
  {
    text: "Check your email (spam folder) for a confirmation receipt from Stripe",
  },
  {
    text: "We'll reach out with details on how to join our GroupMe community",
  },
];

const FALLBACK_CTAS = [
  { label: "Back to Home", href: "/" },
  { label: "See Upcoming Events", href: "/events" },
];

// --- Helpers -----------------------------------------------------------------

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
}

// Walks PortableText blocks and replaces {{price}} in span text with the live
// price string. Leaves all other formatting (marks, links, etc.) intact.
function substitutePrice(
  blocks: PortableTextBlock[] | undefined,
  price: string
): PortableTextBlock[] | undefined {
  if (!blocks) return blocks;
  return blocks.map((block) => {
    const b = block as PortableTextBlock & {
      children?: Array<{ _type?: string; text?: string }>;
    };
    if (b._type !== "block" || !Array.isArray(b.children)) return block;
    return {
      ...b,
      children: b.children.map((child) =>
        child._type === "span" && typeof child.text === "string"
          ? { ...child, text: child.text.replaceAll("{{price}}", price) }
          : child
      ),
    } as PortableTextBlock;
  });
}

function ctaClass(idx: number): string {
  const primary =
    "rounded bg-sasa-red-900 px-6 py-3 text-sm font-semibold text-white hover:bg-sasa-red-700 transition-colors inline-block text-center";
  const secondary =
    "rounded border-2 border-sasa-gold-400 px-6 py-3 text-sm font-semibold text-sasa-gold-400 hover:bg-sasa-gold-400/10 transition-colors inline-block text-center";
  return idx === 0 ? primary : secondary;
}

// --- Page --------------------------------------------------------------------

export default async function JoinReturnPage({
  searchParams,
}: {
  searchParams: { payment_intent?: string };
}) {
  const paymentIntentId = searchParams.payment_intent;

  const [copy, formCopy] = await Promise.all([
    sanityFetchSingle<MembershipConfirmationCopy>(membershipConfirmationQuery),
    sanityFetchSingle<MembershipFormCopy>(membershipFormCopyQuery),
  ]);

  // ---- No payment_intent in URL: direct-visit error state -----------------
  if (!paymentIntentId) {
    const errorHero = copy?.errorState?.heroTitle ?? FALLBACK_ERROR_HERO;
    const errorMessage = copy?.errorState?.message;

    return (
      <div>
        <section className="bg-sasa-red-900 py-16">
          <div className="relative mx-auto max-w-4xl px-4 text-center">
            <div className="hero-paisley-overlay" />
            <div className="relative z-10">
              <h1 className="font-heading text-4xl font-bold text-white sm:text-5xl">
                {errorHero}
              </h1>
            </div>
          </div>
        </section>

        <section className="bg-white py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-xl border-2 border-red-200 bg-red-50 p-6 text-center text-red-700">
              {errorMessage && errorMessage.length > 0 ? (
                <PortableTextRenderer
                  value={errorMessage as PortableTextBlock[]}
                />
              ) : (
                <p>
                  Something went wrong. Please{" "}
                  <Link href="/join" className="underline font-semibold">
                    try again
                  </Link>
                  .
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    );
  }

  // ---- Retrieve PaymentIntent ---------------------------------------------
  let paymentIntent: Stripe.PaymentIntent | null = null;
  try {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (err) {
    console.error("Error retrieving payment intent:", err);
  }

  const isComplete = paymentIntent?.status === "succeeded";

  // Always show what Stripe actually charged for this payment, not the
  // generic (legacy, often-stale) CMS fallback price.
  const priceCents =
    paymentIntent?.amount ?? formCopy?.priceCents ?? FALLBACK_PRICE_CENTS;
  const priceDisplay = formatPrice(priceCents);

  if (isComplete && paymentIntent?.metadata) {
    try {
      await appendMemberToAirtable(paymentIntent.metadata, paymentIntent.id);
    } catch (err) {
      console.error("Airtable write failed:", err);
    }
  }

  // ---- Success or pending state -------------------------------------------
  const successHero =
    copy?.successState?.heroTitle ?? FALLBACK_SUCCESS_HERO;
  const pendingHero =
    copy?.pendingState?.heroTitle ?? FALLBACK_PENDING_HERO;

  const heroTitle = isComplete ? successHero : pendingHero;

  const cardTitle =
    copy?.successState?.cardTitle ?? FALLBACK_SUCCESS_CARD_TITLE;
  const bodyBlocks = substitutePrice(
    copy?.successState?.body,
    priceDisplay
  );
  const nextStepsHeading =
    copy?.successState?.nextStepsHeading ??
    FALLBACK_SUCCESS_NEXT_STEPS_HEADING;
  const nextSteps =
    copy?.successState?.nextSteps && copy.successState.nextSteps.length > 0
      ? copy.successState.nextSteps
      : FALLBACK_NEXT_STEPS;
  const ctas =
    copy?.successState?.ctas && copy.successState.ctas.length > 0
      ? copy.successState.ctas
      : FALLBACK_CTAS;

  const pendingMessage =
    copy?.pendingState?.message ?? FALLBACK_PENDING_MESSAGE;
  const pendingRetryLabel =
    copy?.pendingState?.retryLabel ?? FALLBACK_PENDING_RETRY_LABEL;
  const pendingRetryHref =
    copy?.pendingState?.retryHref ?? FALLBACK_PENDING_RETRY_HREF;

  return (
    <div>
      <section className="bg-sasa-red-900 py-16">
        <div className="relative mx-auto max-w-4xl px-4 text-center">
          <div className="hero-paisley-overlay" />
          <div className="relative z-10">
            <h1 className="font-heading text-4xl font-bold text-white sm:text-5xl">
              {heroTitle}
            </h1>
          </div>
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          {isComplete ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
              <ClearSavedForm />

              <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-sasa-gold-400/20">
                <svg
                  className="h-10 w-10 text-sasa-gold-600"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M20.293 5.293a1 1 0 011.414 1.414l-10 10a1 1 0 01-1.414 0l-6-6a1 1 0 011.414-1.414L10 14.586l9.293-9.293z" />
                </svg>
              </div>

              <h2 className="font-heading text-2xl font-bold text-sasa-red-900 mb-3">
                {cardTitle}
              </h2>

              {bodyBlocks && bodyBlocks.length > 0 ? (
                <div className="mb-4">
                  <PortableTextRenderer value={bodyBlocks} />
                </div>
              ) : (
                fallbackSuccessBody(priceDisplay)
              )}

              <div className="mb-8 rounded-lg bg-gray-50 p-4 text-left">
                <p className="mb-3 text-sm font-semibold text-sasa-red-900">
                  {nextStepsHeading}
                </p>
                <ul className="space-y-2 text-sm text-sasa-neutral-500">
                  {nextSteps.map((step, idx) => (
                    <li key={idx}>
                      {"• "}
                      {step.text}
                      {step.linkLabel && step.linkHref && (
                        <>
                          {" "}
                          <a
                            href={step.linkHref}
                            target={
                              step.linkHref.startsWith("http")
                                ? "_blank"
                                : undefined
                            }
                            rel={
                              step.linkHref.startsWith("http")
                                ? "noopener noreferrer"
                                : undefined
                            }
                            className="text-sasa-gold-600 hover:underline"
                          >
                            {step.linkLabel}
                          </a>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                {ctas.map((cta, idx) =>
                  cta.label && cta.href ? (
                    <Link
                      key={idx}
                      href={cta.href}
                      className={ctaClass(idx)}
                    >
                      {cta.label}
                    </Link>
                  ) : null
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border-2 border-yellow-200 bg-yellow-50 p-6 text-center">
              <p className="mb-4 text-yellow-700">{pendingMessage}</p>
              <Link
                href={pendingRetryHref}
                className="inline-block rounded bg-sasa-red-900 px-6 py-2 text-sm font-semibold text-white hover:bg-sasa-red-700"
              >
                {pendingRetryLabel}
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { computeCardFee } from "@/lib/fees";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

// Must match MAX_TICKETS_PER_ORDER in src/lib/ticketing.ts — that's the
// value actually enforced server-side; this only bounds the input client-side.
const MAX_TICKETS_PER_ORDER = 10;

type PaymentMethod = "card" | "cash";
type Step = 1 | 2;

export interface TicketTypeOption {
  _key: string;
  name: string;
  memberPriceCents: number;
  nonMemberPriceCents: number;
  salesOpen: boolean;
  remaining: number | null;
}

interface TicketPurchaseFormProps {
  eventId: string;
  eventSlug: string;
  ticketTypes: TicketTypeOption[];
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Deliberately text-only (not computed dollar amounts) — the authoritative
// total always comes from the server response, so this can't ever be shown
// alongside a breakdown that doesn't sum to it.
function breakdownLabel(memberUnits: number, nonMemberUnits: number): string {
  const parts: string[] = [];
  if (memberUnits > 0) {
    parts.push(`${memberUnits} ticket${memberUnits === 1 ? "" : "s"} at member price`);
  }
  if (nonMemberUnits > 0) {
    parts.push(`${nonMemberUnits} ticket${nonMemberUnits === 1 ? "" : "s"} at non-member price`);
  }
  return parts.join(" + ");
}

export default function TicketPurchaseForm({
  eventId,
  eventSlug,
  ticketTypes,
}: TicketPurchaseFormProps) {
  const purchasable = useMemo(
    () =>
      ticketTypes.filter(
        (t) => t.salesOpen && (t.remaining === null || t.remaining > 0)
      ),
    [ticketTypes]
  );

  const [step, setStep] = useState<Step>(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [psuEmail, setPsuEmail] = useState("");
  const [psuEmailWarning, setPsuEmailWarning] = useState<string | null>(null);
  const [ticketTypeKey, setTicketTypeKey] = useState(purchasable[0]?._key ?? "");
  const [additionalQuantity, setAdditionalQuantity] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [cardTotals, setCardTotals] = useState<{
    memberUnits: number;
    nonMemberUnits: number;
    subtotalCents: number;
    feeCents: number;
    totalCents: number;
  } | null>(null);

  const [cashConfirmation, setCashConfirmation] = useState<{
    memberUnits: number;
    nonMemberUnits: number;
    amountDueCents: number;
  } | null>(null);

  const selectedType = purchasable.find((t) => t._key === ticketTypeKey);
  const maxQuantity = selectedType
    ? Math.max(
        1,
        Math.min(MAX_TICKETS_PER_ORDER, selectedType.remaining ?? MAX_TICKETS_PER_ORDER)
      )
    : MAX_TICKETS_PER_ORDER;
  // Your own ticket always reserves 1 of the available spots.
  const maxAdditionalQuantity = Math.max(0, maxQuantity - 1);

  useEffect(() => {
    setAdditionalQuantity((q) => Math.min(q, maxAdditionalQuantity));
  }, [maxAdditionalQuantity]);

  // Estimate only — whether this PSU email actually resolves to a current
  // member (and whether they've already used their one discount for this
  // event) is only known server-side. The real price is always confirmed
  // in step 2 from the server response, this just gives a rough preview.
  const psuEmailLooksLikeMember = /^[^\s@]+@psu\.edu$/i.test(psuEmail.trim());
  const estimatedSubtotalCents = selectedType
    ? (psuEmailLooksLikeMember
        ? selectedType.memberPriceCents
        : selectedType.nonMemberPriceCents) +
      selectedType.nonMemberPriceCents * additionalQuantity
    : 0;
  const estimatedTotalCents =
    paymentMethod === "card"
      ? computeCardFee(estimatedSubtotalCents).totalCents
      : estimatedSubtotalCents;

  function validateStep1(): boolean {
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = "First name is required.";
    if (!lastName.trim()) next.lastName = "Last name is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      next.contactEmail = "Please enter a valid email.";
    }
    if (!ticketTypeKey) next.ticketTypeKey = "Please select a ticket type.";
    if (
      !Number.isInteger(additionalQuantity) ||
      additionalQuantity < 0 ||
      additionalQuantity > maxAdditionalQuantity
    ) {
      next.additionalQuantity = `Please choose between 0 and ${maxAdditionalQuantity} additional tickets.`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function goToStep2() {
    if (!validateStep1()) return;
    setSubmitError(null);
    setStep(2);
    setSubmitting(true);

    const payload = {
      eventId,
      ticketTypeKey,
      quantity: 1 + additionalQuantity,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      contactEmail: contactEmail.trim(),
      psuEmail: psuEmail.trim(),
    };

    try {
      if (paymentMethod === "card") {
        const res = await fetch("/api/create-ticket-payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || !data.clientSecret) {
          throw new Error(data.error ?? "Failed to start checkout.");
        }
        setClientSecret(data.clientSecret);
        setCardTotals({
          memberUnits: data.memberUnits,
          nonMemberUnits: data.nonMemberUnits,
          subtotalCents: data.subtotalCents,
          feeCents: data.feeCents,
          totalCents: data.totalCents,
        });
      } else {
        const res = await fetch("/api/create-cash-ticket-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to record your order.");
        }
        setCashConfirmation({
          memberUnits: data.memberUnits,
          nonMemberUnits: data.nonMemberUnits,
          amountDueCents: data.amountDueCents,
        });
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong.");
      setStep(1);
    } finally {
      setSubmitting(false);
    }
  }

  function goBack() {
    setSubmitError(null);
    setStep(1);
  }

  if (purchasable.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sasa-neutral-500">
        Tickets aren&apos;t available for this event right now.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="mb-4 font-heading text-base font-semibold text-sasa-red-900">
              Your Ticket
            </h2>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-sasa-red-900 mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-sasa-red-900 focus:outline-none focus:ring-1 focus:ring-sasa-red-900"
                  />
                  {errors.firstName && (
                    <p className="mt-1 text-xs text-red-500">{errors.firstName}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-sasa-red-900 mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-sasa-red-900 focus:outline-none focus:ring-1 focus:ring-sasa-red-900"
                  />
                  {errors.lastName && (
                    <p className="mt-1 text-xs text-red-500">{errors.lastName}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-sasa-red-900 mb-1">
                  Contact Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="Your receipt and confirmation go here"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-sasa-red-900 focus:outline-none focus:ring-1 focus:ring-sasa-red-900"
                />
                {errors.contactEmail && (
                  <p className="mt-1 text-xs text-red-500">{errors.contactEmail}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-sasa-red-900 mb-1">
                  PSU Email{" "}
                  <span className="font-normal text-sasa-neutral-400">
                    (optional — for member pricing on your own ticket)
                  </span>
                </label>
                <input
                  type="email"
                  value={psuEmail}
                  onChange={(e) => setPsuEmail(e.target.value)}
                  onBlur={() => {
                    const trimmed = psuEmail.trim();
                    setPsuEmailWarning(
                      trimmed && !/^[^\s@]+@psu\.edu$/i.test(trimmed)
                        ? "That doesn't look like a @psu.edu address — you'll be charged the non-member price unless you fix it."
                        : null
                    );
                  }}
                  placeholder="you@psu.edu"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-sasa-red-900 focus:outline-none focus:ring-1 focus:ring-sasa-red-900"
                />
                {psuEmailWarning && (
                  <p className="mt-1 text-xs text-amber-600">{psuEmailWarning}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-sasa-red-900 mb-2">
                  Ticket Type <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  {purchasable.map((t) => (
                    <label
                      key={t._key}
                      className={`flex items-start gap-3 rounded border px-3 py-2 cursor-pointer transition-colors ${
                        ticketTypeKey === t._key
                          ? "border-sasa-red-900 bg-sasa-red-900/5"
                          : "border-gray-300 hover:border-sasa-red-900/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="ticketType"
                        value={t._key}
                        checked={ticketTypeKey === t._key}
                        onChange={() => setTicketTypeKey(t._key)}
                        className="mt-1 accent-sasa-red-900"
                      />
                      <span className="flex-1 text-sm">
                        <span className="block font-medium">{t.name}</span>
                        <span className="block text-sasa-neutral-500">
                          Members {formatPrice(t.memberPriceCents)} · Non-members{" "}
                          {formatPrice(t.nonMemberPriceCents)}
                        </span>
                        {typeof t.remaining === "number" && t.remaining <= 10 && (
                          <span className="block text-xs text-amber-600">
                            Only {t.remaining} left
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
                {errors.ticketTypeKey && (
                  <p className="mt-1 text-xs text-red-500">{errors.ticketTypeKey}</p>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-6">
            <h2 className="mb-1 font-heading text-base font-semibold text-sasa-red-900">
              Additional Tickets
            </h2>
            <p className="mb-3 text-xs text-sasa-neutral-500">
              Buying for friends too? Additional tickets are charged the
              non-member rate
              {selectedType &&
                ` (${formatPrice(selectedType.nonMemberPriceCents)} each)`}{" "}
              — no info needed from them, they&apos;re on the same order as you.
            </p>
            <input
              type="number"
              min={0}
              max={maxAdditionalQuantity}
              value={additionalQuantity}
              onChange={(e) =>
                setAdditionalQuantity(
                  Math.max(
                    0,
                    Math.min(maxAdditionalQuantity, Number(e.target.value) || 0)
                  )
                )
              }
              className="w-24 rounded border border-gray-300 px-3 py-2 text-sm focus:border-sasa-red-900 focus:outline-none focus:ring-1 focus:ring-sasa-red-900"
            />
            {errors.additionalQuantity && (
              <p className="mt-1 text-xs text-red-500">{errors.additionalQuantity}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-sasa-red-900 mb-2">
              Payment Method
            </label>
            <div className="space-y-2">
              <label
                className={`flex items-center gap-3 rounded border px-3 py-2 cursor-pointer transition-colors ${
                  paymentMethod === "card"
                    ? "border-sasa-red-900 bg-sasa-red-900/5"
                    : "border-gray-300 hover:border-sasa-red-900/40"
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  checked={paymentMethod === "card"}
                  onChange={() => setPaymentMethod("card")}
                  className="accent-sasa-red-900"
                />
                <span className="text-sm">Pay now (card)</span>
              </label>
              <label
                className={`flex items-center gap-3 rounded border px-3 py-2 cursor-pointer transition-colors ${
                  paymentMethod === "cash"
                    ? "border-sasa-red-900 bg-sasa-red-900/5"
                    : "border-gray-300 hover:border-sasa-red-900/40"
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  checked={paymentMethod === "cash"}
                  onChange={() => setPaymentMethod("cash")}
                  className="accent-sasa-red-900"
                />
                <span className="text-sm">Pay cash at the door</span>
              </label>
            </div>
            {paymentMethod === "cash" && (
              <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-800">
                  <strong>No cash, no entry.</strong> You&apos;ll be on the
                  door list, but you must pay in full with cash at the door
                  to be let in. Exact change is recommended — we can&apos;t
                  guarantee change will be available at the door.
                </p>
              </div>
            )}
          </div>

          {submitError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-gray-100 pt-4">
            <div className="text-sm">
              <span className="text-sasa-neutral-500">Estimated total: </span>
              <span className="font-semibold text-sasa-red-900">
                {formatPrice(estimatedTotalCents)}
              </span>
              <p className="text-xs text-sasa-neutral-400">
                Confirmed once membership is verified at checkout.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={goToStep2}
              disabled={submitting}
              className="rounded bg-sasa-red-900 px-6 py-2 text-sm font-semibold text-white hover:bg-sasa-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Please wait..." : "Continue →"}
            </button>
          </div>
        </div>
      )}

      {step === 2 && paymentMethod === "card" && (
        <div>
          {submitting && (
            <p className="mb-4 text-sm text-sasa-neutral-500">
              Loading payment form...
            </p>
          )}

          {cardTotals && (
            <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-sasa-neutral-500">
                  {breakdownLabel(cardTotals.memberUnits, cardTotals.nonMemberUnits)}
                </span>
                <span>{formatPrice(cardTotals.subtotalCents)}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between text-sm text-sasa-neutral-500">
                <span>Card processing fee</span>
                <span>{formatPrice(cardTotals.feeCents)}</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between border-t border-gray-200 pt-2">
                <span className="text-base font-semibold text-sasa-red-900">
                  Total
                </span>
                <span className="text-2xl font-bold text-sasa-gold-600">
                  {formatPrice(cardTotals.totalCents)}
                </span>
              </div>
            </div>
          )}

          {submitError && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}

          {clientSecret && (
            <Elements
              stripe={stripePromise}
              options={{ clientSecret, appearance: { theme: "stripe" } }}
            >
              <TicketCheckoutForm eventSlug={eventSlug} />
            </Elements>
          )}

          <div className="mt-6">
            <button
              onClick={goBack}
              disabled={submitting}
              className="rounded border-2 border-sasa-gold-400 px-6 py-2 text-sm font-semibold text-sasa-gold-400 hover:bg-sasa-gold-400/10 disabled:opacity-60 transition-colors"
            >
              ← Back
            </button>
          </div>
        </div>
      )}

      {step === 2 && paymentMethod === "cash" && (
        <div className="text-center">
          {submitting && (
            <p className="text-sm text-sasa-neutral-500">Recording your order...</p>
          )}

          {submitError && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-left">
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}

          {cashConfirmation && (
            <div>
              <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-sasa-gold-400/20">
                <svg
                  className="h-10 w-10 text-sasa-gold-600"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M20.293 5.293a1 1 0 011.414 1.414l-10 10a1 1 0 01-1.414 0l-6-6a1 1 0 011.414-1.414L10 14.586l9.293-9.293z" />
                </svg>
              </div>
              <h2 className="mb-2 font-heading text-xl font-bold text-sasa-red-900">
                You&apos;re on the list!
              </h2>
              <p className="text-sm text-sasa-neutral-500">
                {breakdownLabel(
                  cashConfirmation.memberUnits,
                  cashConfirmation.nonMemberUnits
                )}{" "}
                — bring{" "}
                <span className="font-semibold text-sasa-red-900">
                  {formatPrice(cashConfirmation.amountDueCents)}
                </span>{" "}
                cash to the door.
              </p>
              <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-800">
                  No cash, no entry — you will not be admitted without
                  payment. Exact change is recommended; we can&apos;t
                  guarantee change will be available at the door.
                </p>
              </div>
            </div>
          )}

          {!submitting && !cashConfirmation && (
            <button
              onClick={goBack}
              className="rounded border-2 border-sasa-gold-400 px-6 py-2 text-sm font-semibold text-sasa-gold-400 hover:bg-sasa-gold-400/10 transition-colors"
            >
              ← Back
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface TicketCheckoutFormProps {
  eventSlug: string;
}

function TicketCheckoutForm({ eventSlug }: TicketCheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [isPaymentComplete, setIsPaymentComplete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsLoading(true);
    setErrorMsg(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/events/${eventSlug}/tickets/return`,
      },
    });

    if (error) {
      setErrorMsg(error.message ?? "Payment failed. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement
        onChange={(event) => setIsPaymentComplete(event.complete)}
      />
      {!isPaymentComplete && (
        <p className="mt-3 text-sm text-sasa-neutral-500">
          Please complete your payment details to continue.
        </p>
      )}
      {errorMsg && <p className="mt-3 text-sm text-red-600">{errorMsg}</p>}
      <button
        type="submit"
        disabled={!stripe || isLoading || !isPaymentComplete}
        className="mt-6 w-full rounded bg-sasa-red-900 px-6 py-3 text-sm font-semibold text-white hover:bg-sasa-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? "Processing..." : "Get Tickets"}
      </button>
    </form>
  );
}

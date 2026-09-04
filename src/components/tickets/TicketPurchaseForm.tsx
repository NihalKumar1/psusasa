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
import { breakdownLabel } from "@/lib/ticketLabels";
import { EMAIL_RE, isPsuEmail, PSU_CONTACT_EMAIL_ERROR } from "@/lib/email";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

// Must match MAX_TICKETS_PER_ORDER in src/lib/ticketing.ts — that's the
// value actually enforced server-side; this only bounds the input client-side.
const MAX_TICKETS_PER_ORDER = 10;

// A member-pricing lookup needs the bare university domain — unlike
// isPsuEmail() in @/lib/email, which is a suffix test that also matches
// subdomains.
const PSU_MEMBER_EMAIL_RE = /^[^\s@]+@psu\.edu$/i;

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
  cashPaymentEnabled: boolean;
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function TicketPurchaseForm({
  eventId,
  eventSlug,
  ticketTypes,
  cashPaymentEnabled,
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
  const [memberPricingCheck, setMemberPricingCheck] = useState<{
    isMember: boolean;
    alreadyUsed: boolean;
  } | null>(null);
  const [checkingMemberPricing, setCheckingMemberPricing] = useState(false);
  const [ticketTypeKey, setTicketTypeKey] = useState(purchasable[0]?._key ?? "");
  const [additionalQuantity, setAdditionalQuantity] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  // Which fields have earned the right to show their error yet. The errors
  // themselves are computed continuously below; this only controls when they
  // become visible, so the form never shouts at a field mid-typing.
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

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

  const [freeConfirmation, setFreeConfirmation] = useState<{
    memberUnits: number;
    nonMemberUnits: number;
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

  // Estimate only — the real price is always confirmed in step 2 from the
  // server response. Before the live check resolves (or if it fails), this
  // falls back to a format-only guess; once it resolves, it's authoritative
  // over the guess, since it also knows whether this email already used its
  // one member-priced ticket for this event, which the format check can't.
  const psuEmailLooksLikeMember = PSU_MEMBER_EMAIL_RE.test(psuEmail.trim());
  const eligibleForMemberPrice = memberPricingCheck
    ? memberPricingCheck.isMember && !memberPricingCheck.alreadyUsed
    : psuEmailLooksLikeMember;
  const estimatedOwnUnitCents = selectedType
    ? eligibleForMemberPrice
      ? selectedType.memberPriceCents
      : selectedType.nonMemberPriceCents
    : 0;
  const estimatedAdditionalCents = selectedType
    ? selectedType.nonMemberPriceCents * additionalQuantity
    : 0;
  const estimatedSubtotalCents = estimatedOwnUnitCents + estimatedAdditionalCents;
  // Free orders never touch Stripe, so there's never a fee — regardless of
  // which payment method is selected.
  const estimatedFeeCents =
    paymentMethod === "card" && estimatedSubtotalCents > 0
      ? computeCardFee(estimatedSubtotalCents).feeCents
      : 0;
  const estimatedTotalCents = estimatedSubtotalCents + estimatedFeeCents;

  // The single source of truth for whether step 1 can be submitted. Recomputed
  // every render, so the Continue button and every message below stay in sync
  // with what the buyer has actually typed.
  const step1Errors = useMemo(() => {
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = "First name is required.";
    if (!lastName.trim()) next.lastName = "Last name is required.";

    const trimmedContact = contactEmail.trim();
    if (!trimmedContact) {
      next.contactEmail = "Email is required.";
    } else if (!EMAIL_RE.test(trimmedContact)) {
      next.contactEmail = "Please enter a valid email.";
    } else if (isPsuEmail(trimmedContact)) {
      next.contactEmail = PSU_CONTACT_EMAIL_ERROR;
    }

    // Optional — leaving it blank just means non-member pricing. But a
    // half-typed address would silently cost the buyer money, so it blocks.
    const trimmedPsu = psuEmail.trim();
    if (trimmedPsu && !PSU_MEMBER_EMAIL_RE.test(trimmedPsu)) {
      next.psuEmail =
        "That doesn't look like a @psu.edu address — fix it, or clear the field to pay the non-member price.";
    }

    if (!ticketTypeKey) next.ticketTypeKey = "Please select a ticket type.";
    if (
      !Number.isInteger(additionalQuantity) ||
      additionalQuantity < 0 ||
      additionalQuantity > maxAdditionalQuantity
    ) {
      next.additionalQuantity = `Please choose between 0 and ${maxAdditionalQuantity} additional tickets.`;
    }
    return next;
  }, [
    firstName,
    lastName,
    contactEmail,
    psuEmail,
    ticketTypeKey,
    additionalQuantity,
    maxAdditionalQuantity,
  ]);

  const isStep1Valid = Object.keys(step1Errors).length === 0;

  // Stop revealing a field the moment it becomes valid. Un-revealing (rather
  // than just hiding) means a *new* error never appears mid-typing: fix the
  // field and the message goes; break it again and the form stays quiet until
  // the next blur or Continue click. Returning `prev` unchanged keeps the
  // reference stable so this can't loop.
  useEffect(() => {
    setRevealed((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const field of Object.keys(prev)) {
        if (!step1Errors[field]) {
          delete next[field];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [step1Errors]);

  function reveal(field: string) {
    setRevealed((prev) => ({ ...prev, [field]: true }));
  }

  // The PSU-address error shows the instant it applies — a completed @psu.edu
  // ending is unambiguous, unlike a half-typed address, which waits for blur.
  const contactEmailError = isPsuEmail(contactEmail)
    ? PSU_CONTACT_EMAIL_ERROR
    : revealed.contactEmail
      ? step1Errors.contactEmail
      : undefined;

  async function goToStep2() {
    if (!isStep1Valid) {
      setRevealed(
        Object.fromEntries(Object.keys(step1Errors).map((f) => [f, true]))
      );
      return;
    }
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
        if (!res.ok || (!data.clientSecret && !data.free)) {
          throw new Error(data.error ?? "Failed to start checkout.");
        }
        if (data.free) {
          setFreeConfirmation({
            memberUnits: data.memberUnits,
            nonMemberUnits: data.nonMemberUnits,
          });
        } else {
          setClientSecret(data.clientSecret);
          setCardTotals({
            memberUnits: data.memberUnits,
            nonMemberUnits: data.nonMemberUnits,
            subtotalCents: data.subtotalCents,
            feeCents: data.feeCents,
            totalCents: data.totalCents,
          });
        }
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
        if (data.free) {
          setFreeConfirmation({
            memberUnits: data.memberUnits,
            nonMemberUnits: data.nonMemberUnits,
          });
        } else {
          setCashConfirmation({
            memberUnits: data.memberUnits,
            nonMemberUnits: data.nonMemberUnits,
            amountDueCents: data.amountDueCents,
          });
        }
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
      <div className="mb-8 flex items-center justify-center gap-3">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
              step >= 1
                ? "bg-sasa-red-900 text-white"
                : "border-2 border-gray-300 text-gray-400"
            }`}
          >
            {step > 1 ? (
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.293 5.293a1 1 0 011.414 1.414l-10 10a1 1 0 01-1.414 0l-6-6a1 1 0 011.414-1.414L10 14.586l9.293-9.293z" />
              </svg>
            ) : (
              "1"
            )}
          </div>
          <span className="text-xs text-sasa-neutral-500">Details</span>
        </div>
        <div className={`h-0.5 w-8 ${step > 1 ? "bg-sasa-gold-600" : "bg-gray-200"}`} />
        <div className="flex items-center gap-2">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
              step >= 2
                ? "bg-sasa-red-900 text-white"
                : "border-2 border-gray-300 text-gray-400"
            }`}
          >
            2
          </div>
          <span className="text-xs text-sasa-neutral-500">Payment</span>
        </div>
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <div>
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sasa-red-900/10 text-sasa-red-900">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <circle cx="12" cy="8" r="3" />
                  <path d="M5 19c0-3.87 3.13-7 7-7s7 3.13 7 7" strokeLinecap="round" />
                </svg>
              </span>
              <h2 className="font-heading text-base font-semibold text-sasa-red-900">
                Your Ticket
              </h2>
            </div>
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
                    onBlur={() => reveal("firstName")}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-sasa-red-900 focus:outline-none focus:ring-1 focus:ring-sasa-red-900"
                  />
                  {revealed.firstName && step1Errors.firstName && (
                    <p className="mt-1 text-xs text-red-500">
                      {step1Errors.firstName}
                    </p>
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
                    onBlur={() => reveal("lastName")}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-sasa-red-900 focus:outline-none focus:ring-1 focus:ring-sasa-red-900"
                  />
                  {revealed.lastName && step1Errors.lastName && (
                    <p className="mt-1 text-xs text-red-500">
                      {step1Errors.lastName}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-sasa-red-900 mb-1">
                  Personal Email <span className="text-red-500">*</span>{" "}
                  <span className="font-normal text-sasa-neutral-400">
                    (NOT PSU email)
                  </span>
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  onBlur={() => {
                    // Blurring a field the buyer never filled in shouldn't
                    // yell at them — the Continue button already conveys it.
                    if (contactEmail.trim()) reveal("contactEmail");
                  }}
                  placeholder="Your receipt and confirmation go here"
                  className={`w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                    contactEmailError
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-sasa-red-900 focus:ring-sasa-red-900"
                  }`}
                />
                {contactEmailError && (
                  <p className="mt-1 text-xs text-red-500">{contactEmailError}</p>
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
                  onChange={(e) => {
                    setPsuEmail(e.target.value);
                    // Invalidate the last live check — it was for a
                    // different email, so the estimate falls back to the
                    // format-only guess until the field is blurred again.
                    setMemberPricingCheck(null);
                  }}
                  onBlur={async () => {
                    const trimmed = psuEmail.trim();
                    const looksValid = PSU_MEMBER_EMAIL_RE.test(trimmed);
                    if (trimmed) reveal("psuEmail");

                    if (!looksValid) {
                      setMemberPricingCheck(null);
                      return;
                    }

                    setCheckingMemberPricing(true);
                    try {
                      const res = await fetch("/api/check-member-pricing", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ eventId, psuEmail: trimmed }),
                      });
                      const data = await res.json();
                      if (res.ok) {
                        setMemberPricingCheck({
                          isMember: !!data.isMember,
                          alreadyUsed: !!data.alreadyUsed,
                        });
                      }
                    } catch {
                      // Silent — the estimate just falls back to the
                      // format-only guess. Doesn't block the buyer.
                    } finally {
                      setCheckingMemberPricing(false);
                    }
                  }}
                  placeholder="you@psu.edu"
                  className={`w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                    revealed.psuEmail && step1Errors.psuEmail
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-sasa-red-900 focus:ring-sasa-red-900"
                  }`}
                />
                {checkingMemberPricing && (
                  <p className="mt-1 text-xs text-sasa-neutral-400">
                    Checking membership status...
                  </p>
                )}
                {revealed.psuEmail && step1Errors.psuEmail && (
                  <p className="mt-1 text-xs text-red-500">
                    {step1Errors.psuEmail}
                  </p>
                )}
                {!step1Errors.psuEmail &&
                  memberPricingCheck?.isMember &&
                  memberPricingCheck.alreadyUsed && (
                    <p className="mt-1 text-xs text-amber-600">
                      Your member-priced ticket for this event has already
                      been purchased — additional tickets are charged the
                      non-member price.
                    </p>
                  )}
                {!step1Errors.psuEmail &&
                  memberPricingCheck &&
                  !memberPricingCheck.isMember && (
                    <p className="mt-1 text-xs text-amber-600">
                      We couldn&apos;t find a membership under this email —
                      you&apos;ll be charged the non-member price. If you
                      think this is a mistake, email{" "}
                      <a
                        href="mailto:exec.psusasa@gmail.com"
                        className="underline"
                      >
                        exec.psusasa@gmail.com
                      </a>
                      .
                    </p>
                  )}
              </div>

              <div>
                <label className="block text-sm font-medium text-sasa-red-900 mb-2">
                  Ticket Type <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  {purchasable.map((t) => {
                    const selected = ticketTypeKey === t._key;
                    return (
                      <label
                        key={t._key}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 transition-all ${
                          selected
                            ? "border-sasa-red-900 bg-sasa-red-900/5 shadow-sm"
                            : "border-gray-200 hover:border-sasa-red-900/30 hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="ticketType"
                          value={t._key}
                          checked={selected}
                          onChange={() => setTicketTypeKey(t._key)}
                          className="sr-only"
                        />
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                            selected ? "border-sasa-red-900 bg-sasa-red-900" : "border-gray-300"
                          }`}
                        >
                          {selected && <span className="h-2 w-2 rounded-full bg-white" />}
                        </span>
                        <span className="flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-heading text-sm font-semibold text-sasa-red-900">
                              {t.name}
                            </span>
                            {typeof t.remaining === "number" && t.remaining <= 10 && (
                              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                                {t.remaining} left
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs text-sasa-neutral-500">
                            Members{" "}
                            <span className="font-semibold text-sasa-forest">
                              {formatPrice(t.memberPriceCents)}
                            </span>{" "}
                            · Non-members{" "}
                            <span className="font-semibold text-sasa-neutral-500">
                              {formatPrice(t.nonMemberPriceCents)}
                            </span>
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {revealed.ticketTypeKey && step1Errors.ticketTypeKey && (
                  <p className="mt-1 text-xs text-red-500">
                    {step1Errors.ticketTypeKey}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-6">
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sasa-red-900/10 text-sasa-red-900">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
              </span>
              <h2 className="font-heading text-base font-semibold text-sasa-red-900">
                Additional Tickets
              </h2>
            </div>
            <p className="mb-3 text-xs text-sasa-neutral-500">
              Buying for friends too? Additional tickets are charged the
              non-member rate
              {selectedType &&
                ` (${formatPrice(selectedType.nonMemberPriceCents)} each)`}{" "}
              — no info needed from them, they&apos;re on the same order as you.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setAdditionalQuantity((q) => Math.max(0, q - 1))}
                disabled={additionalQuantity <= 0}
                aria-label="Decrease additional tickets"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-300 text-lg font-semibold text-sasa-red-900 transition-colors hover:bg-gray-50 disabled:opacity-40"
              >
                −
              </button>
              <span className="w-8 text-center text-lg font-semibold text-sasa-red-900">
                {additionalQuantity}
              </span>
              <button
                type="button"
                onClick={() =>
                  setAdditionalQuantity((q) => Math.min(maxAdditionalQuantity, q + 1))
                }
                disabled={additionalQuantity >= maxAdditionalQuantity}
                aria-label="Increase additional tickets"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-300 text-lg font-semibold text-sasa-red-900 transition-colors hover:bg-gray-50 disabled:opacity-40"
              >
                +
              </button>
            </div>
            {revealed.additionalQuantity && step1Errors.additionalQuantity && (
              <p className="mt-1 text-xs text-red-500">
                {step1Errors.additionalQuantity}
              </p>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sasa-red-900/10 text-sm font-bold text-sasa-red-900">
                $
              </span>
              <h2 className="font-heading text-base font-semibold text-sasa-red-900">
                Payment Method
              </h2>
            </div>
            <div className="space-y-2">
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 transition-all ${
                  paymentMethod === "card"
                    ? "border-sasa-red-900 bg-sasa-red-900/5 shadow-sm"
                    : "border-gray-200 hover:border-sasa-red-900/30 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  checked={paymentMethod === "card"}
                  onChange={() => setPaymentMethod("card")}
                  className="sr-only"
                />
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    paymentMethod === "card"
                      ? "border-sasa-red-900 bg-sasa-red-900"
                      : "border-gray-300"
                  }`}
                >
                  {paymentMethod === "card" && (
                    <span className="h-2 w-2 rounded-full bg-white" />
                  )}
                </span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sasa-red-900/10 text-sasa-red-900">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <rect x="2.25" y="5.25" width="19.5" height="13.5" rx="2" />
                    <path d="M2.25 9.75h19.5" strokeLinecap="round" />
                    <path d="M6 15h4" strokeLinecap="round" />
                  </svg>
                </span>
                <span>
                  <span className="block text-sm font-semibold text-sasa-red-900">
                    Pay now (card)
                  </span>
                  <span className="block text-xs text-sasa-neutral-500">
                    Confirmed instantly
                  </span>
                </span>
              </label>
              {cashPaymentEnabled && (
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 transition-all ${
                    paymentMethod === "cash"
                      ? "border-sasa-red-900 bg-sasa-red-900/5 shadow-sm"
                      : "border-gray-200 hover:border-sasa-red-900/30 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={paymentMethod === "cash"}
                    onChange={() => setPaymentMethod("cash")}
                    className="sr-only"
                  />
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      paymentMethod === "cash"
                        ? "border-sasa-red-900 bg-sasa-red-900"
                        : "border-gray-300"
                    }`}
                  >
                    {paymentMethod === "cash" && (
                      <span className="h-2 w-2 rounded-full bg-white" />
                    )}
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sasa-red-900/10 text-sasa-red-900">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <rect x="2.25" y="6" width="19.5" height="12" rx="2" />
                      <circle cx="12" cy="12" r="2.5" />
                    </svg>
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-sasa-red-900">
                      Pay cash at the door
                    </span>
                    <span className="block text-xs text-sasa-neutral-500">
                      Pay when you arrive
                    </span>
                  </span>
                </label>
              )}
            </div>
            {cashPaymentEnabled && paymentMethod === "cash" && (
              <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-800">
                  <strong>No cash, no entry.</strong> You&apos;ll be on the
                  door list, but you must pay in full with cash at the door
                  to be let in. Exact change is recommended — we can&apos;t
                  guarantee change will be available at the door. If the
                  event reaches capacity before you arrive, entry is not
                  guaranteed for cash orders — card purchases are confirmed
                  in advance.
                </p>
              </div>
            )}
            {!cashPaymentEnabled && (
              <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-800">
                  We&apos;ll still take cash at the door — it&apos;s just
                  that only online orders reserve your spot in advance. If
                  the event reaches capacity before you arrive, entry with
                  cash at the door is not guaranteed.
                </p>
              </div>
            )}
          </div>

          {submitError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}

          {selectedType && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <svg className="h-4 w-4 text-sasa-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h6m-6 3h3m-8.25 4.5h13.5c.621 0 1.125-.504 1.125-1.125V7.5c0-.621-.504-1.125-1.125-1.125H5.25C4.629 6.375 4.125 6.879 4.125 7.5v10.875c0 .621.504 1.125 1.125 1.125z"
                  />
                </svg>
                <span className="text-xs font-semibold uppercase tracking-wide text-sasa-neutral-400">
                  Order Summary
                </span>
              </div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-sasa-neutral-500">
                  Your ticket (
                  {eligibleForMemberPrice ? "member" : "non-member"} price)
                </span>
                <span>{formatPrice(estimatedOwnUnitCents)}</span>
              </div>
              {additionalQuantity > 0 && (
                <div className="mt-1 flex items-baseline justify-between text-sm text-sasa-neutral-500">
                  <span>
                    {additionalQuantity} additional ticket
                    {additionalQuantity === 1 ? "" : "s"} (non-member price)
                  </span>
                  <span>{formatPrice(estimatedAdditionalCents)}</span>
                </div>
              )}
              {paymentMethod === "card" && (
                <div className="mt-1 flex items-baseline justify-between text-sm text-sasa-neutral-500">
                  <span>Card processing fee (est.)</span>
                  <span>{formatPrice(estimatedFeeCents)}</span>
                </div>
              )}
              <div className="mt-2 flex items-baseline justify-between border-t border-gray-200 pt-2">
                <span className="text-base font-semibold text-sasa-red-900">
                  Estimated Total
                </span>
                <span className="text-xl font-bold text-sasa-gold-600">
                  {formatPrice(estimatedTotalCents)}
                </span>
              </div>
              <p className="mt-2 text-xs text-sasa-neutral-400">
                Confirmed once membership is verified at checkout.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={goToStep2}
              disabled={submitting || !isStep1Valid}
              className="rounded-lg bg-sasa-red-900 px-8 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sasa-red-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-sasa-red-900"
            >
              {submitting ? "Please wait..." : "Continue →"}
            </button>
          </div>
        </div>
      )}

      {step === 2 && freeConfirmation && (
        <div className="text-center">
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
            You&apos;re confirmed — free!
          </h2>
          <p className="mb-4 text-sm text-sasa-neutral-500">
            {breakdownLabel(
              freeConfirmation.memberUnits,
              freeConfirmation.nonMemberUnits
            )}{" "}
            — no payment needed. A confirmation email is on its way.
          </p>
          <div className="mx-auto max-w-sm rounded-lg border-2 border-sasa-gold-400 bg-sasa-gold-400/10 p-4">
            <p className="text-sm font-bold text-sasa-red-900">
              All you need at the door is your name — you don&apos;t need to
              show a ticket or confirmation email.
            </p>
          </div>
        </div>
      )}

      {step === 2 && paymentMethod === "card" && !freeConfirmation && (
        <div>
          {submitting && (
            <p className="mb-4 text-sm text-sasa-neutral-500">
              Loading payment form...
            </p>
          )}

          {cardTotals && (
            <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <svg className="h-4 w-4 text-sasa-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h6m-6 3h3m-8.25 4.5h13.5c.621 0 1.125-.504 1.125-1.125V7.5c0-.621-.504-1.125-1.125-1.125H5.25C4.629 6.375 4.125 6.879 4.125 7.5v10.875c0 .621.504 1.125 1.125 1.125z"
                  />
                </svg>
                <span className="text-xs font-semibold uppercase tracking-wide text-sasa-neutral-400">
                  Order Summary
                </span>
              </div>
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

      {step === 2 && paymentMethod === "cash" && !freeConfirmation && (
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
              <div className="mt-4 rounded-lg border-2 border-sasa-gold-400 bg-sasa-gold-400/10 p-4">
                <p className="text-sm font-bold text-sasa-red-900">
                  All you need at the door is your name — you don&apos;t need
                  to show a ticket or confirmation email.
                </p>
              </div>
              <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-800">
                  No cash, no entry — you will not be admitted without
                  payment. Exact change is recommended; we can&apos;t
                  guarantee change will be available at the door. If the
                  event reaches capacity before you arrive, entry is not
                  guaranteed for cash orders — card purchases are confirmed
                  in advance.
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

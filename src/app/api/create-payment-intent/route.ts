import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { sanityFetchSingle } from "../../../../sanity/lib/client";
import { membershipFormCopyQuery } from "../../../../sanity/lib/queries";
import type { MembershipFormCopy } from "../../../../sanity/lib/types";
import { computeCardFee } from "@/lib/fees";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// One flat membership price for everyone — set in Studio (Membership Form
// → Membership Price), with this as the last-resort fallback if Sanity is
// ever unreachable.
const FALLBACK_PRICE_CENTS = 3500;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      firstName,
      lastName,
      psuEmail,
      phone,
      year,
      major,
      hometown,
      gender,
      religion,
      identity,
      generation,
      instagram,
    } = body;

    const copy = await sanityFetchSingle<MembershipFormCopy>(
      membershipFormCopyQuery
    );

    const baseAmount =
      typeof copy?.priceCents === "number" && copy.priceCents >= 50
        ? Math.round(copy.priceCents)
        : FALLBACK_PRICE_CENTS;

    // Add a card-processing surcharge so SASA nets the full membership price.
    const { feeCents, totalCents: amount } = computeCardFee(baseAmount);

    const metadata: Record<string, string> = {
      purchaseType: "membership",
      firstName: String(firstName ?? "").slice(0, 500),
      lastName: String(lastName ?? "").slice(0, 500),
      psuEmail: String(psuEmail ?? "").slice(0, 500),
      phone: String(phone ?? "").slice(0, 500),
      year: String(year ?? "").slice(0, 500),
      membershipTier: "Regular",
      amountPaidCents: String(amount),
      baseAmountCents: String(baseAmount),
      cardFeeCents: String(feeCents),
      major: String(major ?? "").slice(0, 500),
      hometown: String(hometown ?? "").slice(0, 500),
      gender: String(gender ?? "").slice(0, 500),
      religion: String(religion ?? "").slice(0, 500),
      identity: String(identity ?? "").slice(0, 500),
      generation: String(generation ?? "").slice(0, 500),
      instagram: String(instagram ?? "").slice(0, 500),
    };

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      metadata,
      receipt_email: psuEmail ?? undefined,
      description: "SASA Membership — Penn State South Asian Student Association",
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error("Payment intent error:", err);
    return NextResponse.json(
      { error: "Failed to initialize payment" },
      { status: 500 }
    );
  }
}

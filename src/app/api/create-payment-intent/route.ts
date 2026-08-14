import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { sanityFetchSingle } from "../../../../sanity/lib/client";
import { membershipFormCopyQuery } from "../../../../sanity/lib/queries";
import type { MembershipFormCopy } from "../../../../sanity/lib/types";
import { lookupPastMember } from "@/lib/airtable";
import { computeCardFee } from "@/lib/fees";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      firstName,
      lastName,
      psuEmail,
      phone,
      year,
      membershipType,
      major,
      hometown,
      gender,
      religion,
      identity,
      generation,
      instagram,
    } = body;

    if (
      membershipType !== "returning" &&
      membershipType !== "transfer" &&
      membershipType !== "new"
    ) {
      return NextResponse.json(
        { error: "Invalid membership type. Please go back and select one." },
        { status: 400 }
      );
    }

    if (membershipType === "returning") {
      const wasPastMember = await lookupPastMember(
        String(firstName ?? ""),
        String(lastName ?? "")
      );
      if (!wasPastMember) {
        return NextResponse.json(
          {
            error:
              "We don't see your name in our 2025–2026 member records. If this is a mistake, please email exec.psusasa@gmail.com — otherwise, please go back and select New Member.",
          },
          { status: 400 }
        );
      }
    }

    const copy = await sanityFetchSingle<MembershipFormCopy>(
      membershipFormCopyQuery
    );

    const tierPriceCents =
      membershipType === "returning"
        ? copy?.tiers?.returningPriceCents
        : membershipType === "transfer"
          ? copy?.tiers?.transferPriceCents
          : copy?.tiers?.newMemberPriceCents;
    const tierLabel =
      membershipType === "returning"
        ? copy?.tiers?.returningLabel ?? "Returning Member"
        : membershipType === "transfer"
          ? copy?.tiers?.transferLabel ?? "Transfer Student"
          : copy?.tiers?.newMemberLabel ?? "New Member";

    const baseAmount =
      typeof tierPriceCents === "number" && tierPriceCents >= 50
        ? Math.round(tierPriceCents)
        : typeof copy?.priceCents === "number" && copy.priceCents >= 50
          ? Math.round(copy.priceCents)
          : 50;

    // Add a card-processing surcharge so SASA nets the full tier price.
    const { feeCents, totalCents: amount } = computeCardFee(baseAmount);

    const metadata: Record<string, string> = {
      purchaseType: "membership",
      firstName: String(firstName ?? "").slice(0, 500),
      lastName: String(lastName ?? "").slice(0, 500),
      psuEmail: String(psuEmail ?? "").slice(0, 500),
      phone: String(phone ?? "").slice(0, 500),
      year: String(year ?? "").slice(0, 500),
      membershipType: String(membershipType).slice(0, 50),
      membershipTier: tierLabel.slice(0, 500),
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

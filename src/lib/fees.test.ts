import { describe, it, expect } from "vitest";
import {
  computeCardFee,
  STRIPE_PERCENT,
  STRIPE_FIXED_CENTS,
} from "@/lib/fees";

/** What Stripe actually deducts from a charge of `totalCents`. */
function stripeCut(totalCents: number): number {
  return totalCents * STRIPE_PERCENT + STRIPE_FIXED_CENTS;
}

describe("computeCardFee", () => {
  it("grosses up so SASA nets the base amount after Stripe's cut", () => {
    // The whole point of the function: charge total, lose the cut, keep base.
    // A flat percentage add-on would under-recover here, which is the mistake
    // this algebra exists to avoid.
    for (const base of [500, 1000, 2500, 3500, 5000, 12345]) {
      const { totalCents } = computeCardFee(base);
      const netted = totalCents - stripeCut(totalCents);
      expect(Math.abs(netted - base)).toBeLessThanOrEqual(1);
    }
  });

  it("recovers more than a naive percentage surcharge would", () => {
    const base = 3500;
    const naive = base + base * STRIPE_PERCENT + STRIPE_FIXED_CENTS;
    expect(computeCardFee(base).totalCents).toBeGreaterThan(naive);
  });

  it("keeps the breakdown internally consistent", () => {
    const { baseCents, feeCents, totalCents } = computeCardFee(3500);
    expect(baseCents + feeCents).toBe(totalCents);
    expect(baseCents).toBe(3500);
    expect(feeCents).toBeGreaterThan(0);
  });

  it("still charges the fixed fee on a zero base", () => {
    const { baseCents, feeCents, totalCents } = computeCardFee(0);
    expect(baseCents).toBe(0);
    expect(totalCents).toBe(Math.round(STRIPE_FIXED_CENTS / (1 - STRIPE_PERCENT)));
    expect(feeCents).toBe(totalCents);
  });

  it("floors a negative base at zero rather than producing a negative charge", () => {
    expect(computeCardFee(-500).baseCents).toBe(0);
    expect(computeCardFee(-500).totalCents).toBeGreaterThan(0);
  });

  it("rounds a fractional base to whole cents", () => {
    expect(computeCardFee(1000.4).baseCents).toBe(1000);
    expect(Number.isInteger(computeCardFee(1000.4).totalCents)).toBe(true);
  });
});

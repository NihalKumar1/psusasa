import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
  timingSafeEqual,
  CHECKIN_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/checkinAuth";

afterEach(() => {
  vi.useRealTimers();
});

describe("createSessionToken / verifySessionToken", () => {
  it("round-trips the events a token was issued for", async () => {
    const token = await createSessionToken(["event-a", "event-b"]);
    expect(await verifySessionToken(token)).toEqual(["event-a", "event-b"]);
  });

  it("rejects a token whose signature has been tampered with", async () => {
    const token = await createSessionToken(["event-a"]);
    const [payload, sig] = token.split(".");
    // Flip a character in the signature, keeping its length so the comparison
    // has to actually compare rather than short-circuit on length.
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    expect(await verifySessionToken(`${payload}.${flipped}`)).toEqual([]);
  });

  it("rejects a token whose payload has been swapped for another event", async () => {
    // The attack this guards: re-using one event's door password to reach a
    // different event's board.
    const mine = await createSessionToken(["event-a"]);
    const theirs = await createSessionToken(["event-b"]);
    const forged = `${theirs.split(".")[0]}.${mine.split(".")[1]}`;
    expect(await verifySessionToken(forged)).toEqual([]);
  });

  it("rejects missing and malformed tokens", async () => {
    expect(await verifySessionToken(undefined)).toEqual([]);
    expect(await verifySessionToken(null)).toEqual([]);
    expect(await verifySessionToken("")).toEqual([]);
    expect(await verifySessionToken("no-dot")).toEqual([]);
    expect(await verifySessionToken("too.many.dots")).toEqual([]);
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = await createSessionToken(["event-a"]);

    // Still good just inside the window...
    vi.advanceTimersByTime((CHECKIN_COOKIE_MAX_AGE_SECONDS - 60) * 1000);
    expect(await verifySessionToken(token)).toEqual(["event-a"]);

    // ...and dead past it. A door shift, not an indefinite session.
    vi.advanceTimersByTime(120 * 1000);
    expect(await verifySessionToken(token)).toEqual([]);
  });

  it("accepts a token with no events without granting any", async () => {
    const token = await createSessionToken([]);
    expect(await verifySessionToken(token)).toEqual([]);
  });
});

describe("timingSafeEqual", () => {
  it("matches identical strings", () => {
    expect(timingSafeEqual("hunter2", "hunter2")).toBe(true);
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("rejects differing strings of the same length", () => {
    expect(timingSafeEqual("hunter2", "hunter3")).toBe(false);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
  });

  it("rejects strings of differing length", () => {
    expect(timingSafeEqual("hunter2", "hunter22")).toBe(false);
    expect(timingSafeEqual("hunter2", "")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(timingSafeEqual("Hunter2", "hunter2")).toBe(false);
  });
});

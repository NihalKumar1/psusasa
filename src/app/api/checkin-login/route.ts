import { NextRequest, NextResponse } from "next/server";
import { sanityFetchSingle } from "../../../../sanity/lib/client";
import { eventCheckinAuthQuery } from "../../../../sanity/lib/queries";
import {
  CHECKIN_COOKIE_MAX_AGE_SECONDS,
  CHECKIN_COOKIE_NAME,
  createSessionToken,
  timingSafeEqual,
  verifySessionToken,
} from "@/lib/checkinAuth";

// Named as a sibling of /api/checkin/ (not nested inside it) so the
// middleware matcher never needs an exclusion list for the login route itself.

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  try {
    const { eventId, password } = await req.json();

    if (
      typeof eventId !== "string" ||
      !eventId ||
      typeof password !== "string" ||
      !password
    ) {
      return NextResponse.json(
        { error: "Missing event or password." },
        { status: 400 }
      );
    }

    const event = await sanityFetchSingle<{
      _id: string;
      checkinPassword?: string;
    }>(eventCheckinAuthQuery, { id: eventId });

    const actualPassword = event?.checkinPassword ?? "";
    const ok = actualPassword.length > 0 && timingSafeEqual(password, actualPassword);

    if (!ok) {
      // Cheap brute-force mitigation — no rate limiting exists in this app.
      await delay(1000);
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }

    const existingEvents = await verifySessionToken(
      req.cookies.get(CHECKIN_COOKIE_NAME)?.value
    );
    const events = Array.from(new Set([...existingEvents, eventId]));
    const token = await createSessionToken(events);

    const res = NextResponse.json({ ok: true });
    res.cookies.set(CHECKIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: CHECKIN_COOKIE_MAX_AGE_SECONDS,
    });
    return res;
  } catch (err) {
    console.error("Check-in login error:", err);
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}

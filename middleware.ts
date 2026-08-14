import { NextRequest, NextResponse } from "next/server";
import { CHECKIN_COOKIE_NAME, verifySessionToken } from "@/lib/checkinAuth";

// Gates the door check-in tool. Each ticketed event has its own password
// (set in Studio), so authorization is per-event: a session can be valid
// for event A but not event B. /checkin (the event picker) and
// /checkin/[eventId]/login are intentionally left out of the gate — the
// picker only shows public event names/dates, and gating the login page
// itself would create a redirect loop.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const loginPageMatch = pathname.match(/^\/checkin\/([^/]+)\/login\/?$/);
  if (loginPageMatch) return NextResponse.next();

  const pageMatch = pathname.match(/^\/checkin\/([^/]+)\/?$/);
  const apiMatch = pathname.match(/^\/api\/checkin\/([^/]+)\//);
  const eventId = pageMatch?.[1] ?? apiMatch?.[1];

  if (!eventId) return NextResponse.next();

  const token = req.cookies.get(CHECKIN_COOKIE_NAME)?.value;
  const authorizedEvents = await verifySessionToken(token);

  if (authorizedEvents.includes(eventId)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  return NextResponse.redirect(new URL(`/checkin/${eventId}/login`, req.url));
}

export const config = {
  matcher: ["/checkin/:path*", "/api/checkin/:path*"],
};

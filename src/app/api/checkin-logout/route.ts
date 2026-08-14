import { NextResponse } from "next/server";
import { CHECKIN_COOKIE_NAME } from "@/lib/checkinAuth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CHECKIN_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}

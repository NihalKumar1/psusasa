import type { Metadata } from "next";
import Link from "next/link";
import LogoutButton from "@/components/checkin/LogoutButton";

export const metadata: Metadata = {
  title: "Door Check-In | SASA",
  robots: { index: false, follow: false },
};

export default function CheckinLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-sasa-red-900 px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link
            href="/checkin"
            className="font-heading text-sm font-semibold text-white"
          >
            SASA Door Check-In
          </Link>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}

import { sanityFetchSingle } from "../../../../../sanity/lib/client";
import { eventByIdQuery } from "../../../../../sanity/lib/queries";
import type { SanityEvent } from "@/lib/types";
import CheckinLoginForm from "@/components/checkin/CheckinLoginForm";

export const dynamic = "force-dynamic";

interface CheckinLoginPageProps {
  params: { eventId: string };
}

export default async function CheckinLoginPage({
  params,
}: CheckinLoginPageProps) {
  const event = await sanityFetchSingle<SanityEvent>(eventByIdQuery, {
    id: params.eventId,
  });

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 font-heading text-xl font-bold text-sasa-red-900">
        {event?.title ?? "Check-In"}
      </h1>
      <p className="mb-6 text-sm text-sasa-neutral-500">
        Enter this event&apos;s door check-in password.
      </p>
      <CheckinLoginForm eventId={params.eventId} />
    </div>
  );
}

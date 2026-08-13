"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  return (
    <button
      onClick={async () => {
        await fetch("/api/checkin-logout", { method: "POST" });
        router.push("/checkin");
        router.refresh();
      }}
      className="text-xs font-medium text-white/80 hover:text-white"
    >
      Log Out
    </button>
  );
}

"use client";

import React, { useState } from "react";

interface CheckinLoginFormProps {
  eventId: string;
}

export default function CheckinLoginForm({ eventId }: CheckinLoginFormProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed.");
        setLoading(false);
        return;
      }
      // Hard navigation on purpose — this is an auth boundary, so a full
      // request (fresh middleware check, no client router cache) is safer
      // than a soft client-side transition here.
      window.location.href = `/checkin/${eventId}`;
    } catch {
      setError("Login failed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-sasa-red-900">
          Password
        </label>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-sasa-red-900 focus:outline-none focus:ring-1 focus:ring-sasa-red-900"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading || !password}
        className="w-full rounded bg-sasa-red-900 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-sasa-red-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Checking..." : "Enter"}
      </button>
    </form>
  );
}

import { createClient } from "next-sanity";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "";
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2024-01-01";

export const client = projectId
  ? createClient({
      projectId,
      dataset,
      apiVersion,
      // Deliberately never use Sanity's CDN. It's fine for latency/cost, but
      // its cache can lag well behind a publish, which is unacceptable for
      // ticketing/check-in data (is ticketing on, current password, live
      // capacity) — confirmed in practice, not just theoretical.
      useCdn: false,
    })
  : null;

// next-sanity/@sanity/client defaults an un-annotated .fetch() call to
// `cache: "force-cache"` on Next.js 14 — a separate layer from Sanity's own
// CDN, and one that persists across deployments on Vercel. Pass `no-store`
// explicitly on every call so this app is never caching stale Sanity data
// at any layer, not just the ones we already knew about.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sanityFetch<T>(query: string, params?: Record<string, any>): Promise<T[]> {
  if (!client) return [] as unknown as T[];
  return client.fetch<T[]>(query, params ?? {}, { cache: "no-store" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sanityFetchSingle<T>(query: string, params?: Record<string, any>): Promise<T | null> {
  if (!client) return null;
  return client.fetch<T | null>(query, params ?? {}, { cache: "no-store" });
}

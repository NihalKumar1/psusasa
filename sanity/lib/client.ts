import { createClient } from "next-sanity";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "";
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2024-01-01";

export const client = projectId
  ? createClient({
      projectId,
      dataset,
      apiVersion,
      useCdn: process.env.NODE_ENV === "production",
    })
  : null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sanityFetch<T>(query: string, params?: Record<string, any>): Promise<T[]> {
  if (!client) return [] as unknown as T[];
  if (params) return client.fetch<T[]>(query, params);
  return client.fetch<T[]>(query);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sanityFetchSingle<T>(query: string, params?: Record<string, any>): Promise<T | null> {
  if (!client) return null;
  if (params) return client.fetch<T | null>(query, params);
  return client.fetch<T | null>(query);
}

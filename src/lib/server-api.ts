// DEMO OVERLAY (replaces the website's lib/server-api.ts on sync).
// The demo has no server API: pages always load their data in the browser,
// from the demo database.

import { ApiResponse } from "../types/api";

export class NotFoundError extends Error {}

export async function serverGet<T>(path: string, revalidate = 300): Promise<ApiResponse<T> | null> {
  void path;
  void revalidate;
  return null;
}

export const jsonLd = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

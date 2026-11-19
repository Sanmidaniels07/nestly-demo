// The demo's pretend API: routes registered as "METHOD /path/:param" and
// answered in the browser from the demo database (see adapter.ts).

import type { DemoDB, DemoUser } from "./db";

export interface Ctx {
  params: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown>;
  db: DemoDB;
  /** The signed-in demo persona, or null for a guest. */
  user: DemoUser | null;
}

export interface Reply {
  status: number;
  data: unknown;
}

export type Handler = (ctx: Ctx) => Reply | Promise<Reply>;

interface Route {
  method: string;
  parts: string[];
  handler: Handler;
}

const routes: Route[] = [];

export const route = (spec: string, handler: Handler) => {
  const [method, path] = spec.split(" ");
  routes.push({ method: method.toUpperCase(), parts: path.split("/").filter(Boolean), handler });
};

export const match = (method: string, path: string) => {
  const parts = path.split("/").filter(Boolean);
  // Literal segments beat :params, so "/products/me" wins over "/products/:id".
  let best: { route: Route; params: Record<string, string>; score: number } | null = null;
  for (const candidate of routes) {
    if (candidate.method !== method || candidate.parts.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let score = 0;
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      const want = candidate.parts[i];
      if (want.startsWith(":")) params[want.slice(1)] = decodeURIComponent(parts[i]);
      else if (want === parts[i]) score += 1;
      else {
        ok = false;
        break;
      }
    }
    if (ok && (!best || score > best.score)) best = { route: candidate, params, score };
  }
  return best;
};

// ---- Reply helpers (same envelope as the real API) ----

export const ok = (data: unknown, message = "OK", status = 200): Reply => ({ status, data: { success: true, message, data } });

export const created = (data: unknown, message = "Created") => ok(data, message, 201);

export const fail = (status: number, message: string): Reply => ({ status, data: { success: false, message } });

export class DemoError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Throws a 401 for guests - handlers call it where the real API needs a login. */
export const needUser = (ctx: Ctx) => {
  if (!ctx.user) throw new DemoError(401, "Please log in to continue.");
  return ctx.user;
};

export const paginate = <T>(items: T[], query: Record<string, string>, key: string, extra: Record<string, unknown> = {}) => {
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
  const page = Math.max(1, Number(query.page) || 1);
  const total = items.length;
  return {
    [key]: items.slice((page - 1) * limit, page * limit),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    ...extra,
  };
};

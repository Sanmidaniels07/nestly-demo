/* eslint-disable @typescript-eslint/no-explicit-any */
// Answers every API request inside the browser. Installed on axios (see
// lib/axios.ts in demo-overlay), so the real app's screens run unchanged on
// the demo database - no server, no real accounts, no real money.

import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";

import { getDB, saveDB } from "./db";
import { userIdFromToken } from "./persona";
import { DemoError, match, paginate, type Reply } from "./router";
import "./routes";

export const API_BASE = "/demo-api";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const missing = new Set<string>();

const toPath = (config: InternalAxiosRequestConfig) => {
  const url = config.url ?? "";
  const full = /^https?:\/\//.test(url) || url.startsWith(API_BASE) ? url : `${config.baseURL ?? ""}${url}`;
  const parsed = new URL(full, "http://demo.local");
  const query: Record<string, string> = {};
  parsed.searchParams.forEach((value, key) => (query[key] = value));
  for (const [key, value] of Object.entries(config.params ?? {})) {
    if (value !== undefined && value !== null) query[key] = String(value);
  }
  return { path: parsed.pathname.replace(API_BASE, "") || "/", query };
};

const toBody = (data: unknown): Record<string, unknown> => {
  if (!data) return {};
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  if (typeof FormData !== "undefined" && data instanceof FormData) {
    const out: Record<string, unknown> = {};
    data.forEach((value, key) => (out[key] = value));
    return out;
  }
  return data as Record<string, unknown>;
};

// Anything not built yet still answers sensibly: an empty list for reads
// (in the same shape as the real API's lists), "done" for writes.
// Real ids (cuid with digits, demo ids like "p_001") - not words like "conversations".
const isId = (part: string) => /^(cdemo[a-z0-9]+|c[a-z0-9]*\d[a-z0-9]{18,}|[a-z]{1,4}_[a-z0-9_]+|\d+)$/.test(part);

const fallback = (method: string, path: string): Reply => {
  const key = `${method} /${path.split("/").filter(Boolean).map((part) => (isId(part) ? ":id" : part)).join("/")}`;
  if (!missing.has(key)) {
    missing.add(key);
    console.warn("[nestly demo] no handler yet:", key, path);
    if (typeof window !== "undefined") (window as any).__demoMissing = [...missing];
  }
  if (method !== "GET") return { status: 200, data: { success: true, message: "Done (demo)", data: {} } };
  const last = path.split("/").filter((part) => part && !isId(part)).pop() ?? "items";
  return { status: 200, data: { success: true, message: "OK", data: paginate([], {}, last.replace(/-([a-z])/g, (_, c) => c.toUpperCase())) } };
};

export const demoAdapter: AxiosAdapter = async (config) => {
  const method = (config.method ?? "get").toUpperCase();
  const { path, query } = toPath(config);
  const auth = (config.headers?.Authorization ?? config.headers?.authorization) as string | undefined;
  const db = getDB();
  const userId = userIdFromToken(auth);
  const user = userId ? db.users.find((u) => u.id === userId) ?? null : null;

  // Feels like a real network, but snappy.
  await sleep(method === "GET" ? 120 + Math.random() * 220 : 280 + Math.random() * 320);

  let reply: Reply;
  const found = match(method, path);
  try {
    reply = found ? await found.route.handler({ params: found.params, query, body: toBody(config.data), db, user }) : fallback(method, path);
  } catch (error) {
    if (error instanceof DemoError) reply = { status: error.status, data: { success: false, message: error.message } };
    else {
      console.error("[nestly demo] handler crashed:", method, path, error);
      reply = { status: 500, data: { success: false, message: "Something went wrong in the demo." } };
    }
  }
  if (method !== "GET") saveDB();

  const response: AxiosResponse = {
    data: reply.data,
    status: reply.status,
    statusText: String(reply.status),
    headers: {},
    config,
    request: {},
  };
  if (reply.status >= 400) {
    throw new AxiosError(
      (reply.data as any)?.message ?? `Request failed with status code ${reply.status}`,
      reply.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
      config,
      {},
      response
    );
  }
  return response;
};

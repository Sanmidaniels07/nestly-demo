/* eslint-disable @typescript-eslint/no-explicit-any */
// The demo's database: plain tables held in memory and saved to this
// visitor's browser, so their changes survive a reload until they press
// "Reset demo". Nothing ever leaves the browser.

import { buildSeed } from "./seed";
import { addHistory } from "./history";

export type Row = Record<string, any>;

export interface DemoUser extends Row {
  id: string;
  name: string;
  email: string;
  username: string;
  avatar: string | null;
  role: "USER" | "ADMIN";
}

export interface DemoDB {
  version: number;
  users: DemoUser[];
  sellers: Row[];
  stores: Row[];
  shippingOptions: Row[];
  categories: Row[];
  products: Row[];
  reviews: Row[];
  follows: Row[]; // { followerId, userId? , storeId? }
  addresses: Row[];
  carts: Row[]; // { userId, items: [{ id, productId, variationId, quantity }] }
  orders: Row[];
  notifications: Row[];
  conversations: Row[];
  messages: Row[];
  wishlist: Row[]; // { userId, productId, createdAt }
  gifts: Row[];
  groupGifts: Row[];
  paymentLinks: Row[];
  offers: Row[];
  lives: Row[];
  posts: Row[];
  feedAreas: Row[]; // { userId, state, area }
  payouts: Row[];
  /** Paystack-style references of payments started, waiting for the fake checkout. */
  payments: Row[];
}

const KEY = "nestly-demo:db";
export const DB_VERSION = 1;

let db: DemoDB | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const load = (): DemoDB => {
  if (typeof window !== "undefined") {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as DemoDB | null;
      if (saved && saved.version === DB_VERSION) return saved;
    } catch {
      // Storage blocked or corrupt - start fresh.
    }
  }
  return fresh();
};

// A new demo world: the seed plus a believable history (orders, chats,
// notifications), made with the same code that serves them.
const fresh = (): DemoDB => {
  const seeded = buildSeed();
  addHistory(seeded);
  return seeded;
};

export const getDB = (): DemoDB => (db ??= load());

/** Saves soon (batched), after a handler changed something. */
export const saveDB = () => {
  if (typeof window === "undefined") return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(getDB()));
    } catch {
      // Full or blocked storage: the demo still works for this visit.
    }
  }, 150);
};

export const resetDB = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  db = fresh();
};

export { newId, now, daysAgo, inDays } from "./util";

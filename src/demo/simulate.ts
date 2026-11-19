// Moves things along on their own, so the demo world feels alive: a new
// order is prepared and shipped a little later, with a notification each
// time. Steps are timestamps checked on every request, so they still happen
// after a reload.

import type { DemoDB, Row } from "./db";
import { advanceItem, notify, storeById } from "./model";
import { orderNumber } from "./util";

export interface SimStep {
  at: number; // epoch ms
  kind: "PROCESSING" | "SHIPPED";
  done?: boolean;
}

/** Plans the seller's next steps for an order the visitor just paid for. */
export const planOrder = (order: Row) => {
  const start = Date.now();
  order.sim = [
    { at: start + 20_000, kind: "PROCESSING" },
    { at: start + 75_000, kind: "SHIPPED" },
  ] satisfies SimStep[];
};

export const tick = (db: DemoDB) => {
  const nowMs = Date.now();
  let changed = false;
  for (const order of db.orders) {
    if (!order.sim || order.status === "CANCELLED") continue;
    for (const step of order.sim as SimStep[]) {
      if (step.done || step.at > nowMs) continue;
      step.done = true;
      changed = true;
      const at = new Date(step.at).toISOString();
      for (const item of order.items) if (item.status !== "DELIVERED") advanceItem(db, order, item, step.kind, at);
      const store = storeById(db, order.shipping[0]?.storeId);
      if (step.kind === "PROCESSING")
        notify(db, order.userId, "Your order is being prepared 👩‍🍳", `${store?.name ?? "The seller"} started preparing order ${orderNumber(order.id)}.`, { type: "ORDER", id: order.id }, "ORDER");
      else
        notify(db, order.userId, "Your order is on the way 🚚", `${store?.name ?? "The seller"} shipped order ${orderNumber(order.id)}. Keep your delivery code ready - only give it to the rider when you have your items.`, { type: "ORDER", id: order.id }, "ORDER");
    }
  }
  return changed;
};

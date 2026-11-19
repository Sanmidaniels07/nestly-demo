// Checkout from the cart: an unpaid order, then the demo payment sheet.
// Paying runs the same step Paystack's webhook would (order paid, stock
// taken, delivery codes made, seller told).

import { getDB, type Row } from "../db";
import { createOrder, isListed, markPaid, orderView, productById } from "../model";
import { startPayment, whenPaid, paymentByReference } from "../payments";
import { fail, needUser, ok, route } from "../router";
import { planOrder } from "../simulate";

whenPaid("ORDER", (db, payment) => {
  for (const orderId of payment.data.orderIds as string[]) {
    const order = db.orders.find((o) => o.id === orderId);
    if (!order) continue;
    markPaid(db, order);
    // The visitor's own purchases move along on their own afterwards.
    if (payment.data.simulate) planOrder(order);
  }
});

route("POST /checkout/initiate", (ctx) => {
  const user = needUser(ctx);
  const db = getDB();
  const cart = db.carts.find((c) => c.userId === user.id);
  const lines = (cart?.items ?? []) as Row[];
  if (!lines.length) return fail(400, "Your cart is empty.");
  const address = db.addresses.find((a) => a.id === ctx.body.addressId && a.userId === user.id);
  if (!address) return fail(400, "Add or choose your delivery address first.");
  for (const line of lines) {
    const p = productById(db, line.productId);
    if (!p || !isListed(db, p)) return fail(400, "Something in your cart is no longer available.");
    if (line.quantity > p.stock) return fail(400, `Only ${p.stock} of "${p.title}" left - lower the quantity.`);
  }
  const shipping: Record<string, string> = {};
  for (const sel of (ctx.body.shippingSelections as Row[] | undefined) ?? []) shipping[sel.storeId] = sel.shippingOptionId;
  const stores = [...new Set(lines.map((l) => productById(db, l.productId)!.storeId))];
  for (const storeId of stores) {
    if (!shipping[storeId]) return fail(400, "Choose how each order gets to you.");
  }
  const notes = ((ctx.body.sellerNotes as Row[] | undefined) ?? []).filter((n) => n.note?.trim());
  const order = createOrder(db, {
    userId: user.id,
    lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    address,
    shipping,
    source: "CHECKOUT",
    deliveryPhone: (ctx.body.deliveryPhone as string) ?? address.phone,
  });
  order.sellerNotes = notes.map((n) => ({ storeId: n.storeId, note: n.note }));
  const pay = startPayment(db, "ORDER", order.total, user.email, { orderIds: [order.id], simulate: true }, order.paymentReference);
  return ok({ order: orderView(db, order), ...pay }, "Checkout started");
});

route("GET /checkout/verify/:reference", (ctx) => {
  const user = needUser(ctx);
  const db = getDB();
  const payment = paymentByReference(ctx.params.reference);
  if (!payment || payment.status !== "SUCCESS") return fail(400, "Payment was not successful.");
  const order = db.orders.find((o) => o.id === payment.data.orderIds[0] && o.userId === user.id);
  return order ? ok(orderView(db, order), "Payment verified") : fail(404, "Order not found.");
});

route("POST /checkout/charge-saved-card", () => fail(400, "Saved cards aren't in the demo - pay with the demo payment sheet."));
route("GET /payment-methods", () => ok([]));

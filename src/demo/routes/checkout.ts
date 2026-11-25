// Checkout from the cart: an unpaid order, then the demo payment sheet.
// Paying runs the same step Paystack's webhook would (order paid, stock
// taken, delivery codes made, seller told).

import { getDB, type DemoDB, type DemoUser, type Row } from "../db";
import { createOrder, isListed, markPaid, orderView, productById, storeById } from "../model";
import { startPayment, whenPaid, paymentByReference } from "../payments";
import { fail, needUser, ok, route } from "../router";
import { planOrder } from "../simulate";
import { newId, now, shortCode } from "../util";

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

// ---------- shopping without an account ----------
type Line = { productId: string; variationId?: string | null; quantity: number };
const linesOf = (body: Row): Line[] => ((body.items as Line[] | undefined) ?? []).filter((l) => l && l.productId);

const quote = (db: DemoDB, lines: Line[]) => {
  const items = lines.map((line) => {
    const p = productById(db, line.productId);
    const problem = !p || !isListed(db, p) ? "No longer available" : p.stock <= 0 ? "Sold out" : line.quantity > p.stock ? `Only ${p.stock} left` : null;
    return {
      productId: line.productId,
      variationId: line.variationId ?? null,
      quantity: line.quantity,
      problem,
      title: p?.title ?? null,
      image: p?.images[0]?.url ?? null,
      variantLabel: null,
      unitPrice: p?.price ?? 0,
      maxQuantity: p?.stock ?? 0,
      storeId: p?.storeId ?? null,
    };
  });
  const storeIds = [...new Set(items.map((i) => i.storeId).filter(Boolean))] as string[];
  const stores = storeIds.map((id) => {
    const s = storeById(db, id)!;
    const shippingOptions = db.shippingOptions.filter((o) => o.storeId === id && !o.isArchived);
    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      logo: s.logo,
      isVerified: s.isVerified,
      problem: shippingOptions.length ? null : "This seller hasn't set up delivery or pickup yet.",
      shippingOptions,
    };
  });
  const subtotal = items.filter((i) => !i.problem).reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  return { items, stores, subtotal };
};

route("POST /checkout/guest/quote", (ctx) => ok(quote(getDB(), linesOf(ctx.body))));

route("POST /checkout/guest", (ctx) => {
  const db = getDB();
  const lines = linesOf(ctx.body);
  if (!lines.length) return fail(400, "Your cart is empty.");
  const priced = quote(db, lines);
  const broken = priced.items.find((i) => i.problem);
  if (broken) return fail(400, `"${broken.title ?? "An item"}": ${broken.problem}`);
  const email = String(ctx.body.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) return fail(400, "Enter your email.");
  if (db.users.some((u) => u.email === email && !u.isGuest)) return fail(409, "You already have a Nestly account with this email. Log in to pay.");
  const shipping: Record<string, string> = {};
  for (const sel of (ctx.body.shippingSelections as Row[] | undefined) ?? []) shipping[sel.storeId] = sel.shippingOptionId;
  for (const store of priced.stores) if (!shipping[store.id]) return fail(400, "Choose how each order gets to you.");
  let guest = db.users.find((u) => u.email === email && u.isGuest) as DemoUser | undefined;
  if (!guest) {
    guest = { id: newId(), name: String(ctx.body.name ?? "Guest"), email, username: `guest_${shortCode(5).toLowerCase()}`, avatar: null, role: "USER", isGuest: true, createdAt: now() } as DemoUser;
    db.users.push(guest);
  }
  const address = { id: newId(), userId: guest.id, fullName: guest.name, phone: String(ctx.body.phone ?? ""), address: String(ctx.body.address ?? ""), city: String(ctx.body.city ?? ""), state: String(ctx.body.state ?? ""), country: "Nigeria", isDefault: true, createdAt: now() };
  db.addresses.push(address);
  const order = createOrder(db, {
    userId: guest.id,
    lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    address,
    shipping,
    source: "CHECKOUT",
    deliveryPhone: address.phone,
  });
  const guestToken = shortCode(32);
  order.guestAccessToken = guestToken;
  const pay = startPayment(db, "ORDER", order.total, guest.email, { orderIds: [order.id], simulate: true }, order.paymentReference);
  return ok({ orderId: order.id, ...pay, total: order.total, guestToken }, "Payment started");
});

route("POST /checkout/charge-saved-card", () => fail(400, "Saved cards aren't in the demo - pay with the demo payment sheet."));
route("GET /payment-methods", () => ok([]));

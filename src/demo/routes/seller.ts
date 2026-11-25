// Seller Hub: dashboard numbers, orders (with delivery codes), products,
// customers, money held and paid out, lives.

import { getDB, type DemoUser, type Row } from "../db";
import { advanceItem, notify, productById, productCard, sellerOrderView, storeOfUser, storeView, userById } from "../model";
import { DemoError, created, fail, needUser, ok, paginate, route, type Ctx } from "../router";
import { liveCard } from "./social";
import { newId, now, orderNumber } from "../util";

const REVENUE = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

const myStore = (ctx: Ctx) => {
  const user = needUser(ctx) as DemoUser;
  const store = storeOfUser(getDB(), user.id);
  if (!store) throw new DemoError(404, "You don't have a store yet.");
  return { user, store };
};

const storeItems = (storeId: string) => {
  const db = getDB();
  return db.orders.flatMap((o) => o.items.filter((i: Row) => productById(db, i.productId)?.storeId === storeId).map((i: Row) => ({ ...i, order: o })));
};
const storeOrders = (storeId: string) =>
  getDB()
    .orders.filter((o) => o.status !== "PENDING" && o.shipping.some((s: Row) => s.storeId === storeId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

route("GET /seller/dashboard/stats", (ctx) => {
  const { store } = myStore(ctx);
  const db = getDB();
  const items = storeItems(store.id).filter((i) => REVENUE.includes(i.order.status));
  return ok({
    totalProducts: db.products.filter((p) => p.storeId === store.id && p.status !== "PRIVATE").length,
    totalOrders: new Set(items.map((i) => i.orderId)).size,
    totalRevenue: items.reduce((a, i) => a + i.totalPrice, 0),
    pendingOrders: new Set(items.filter((i) => ["PENDING", "PROCESSING"].includes(i.status)).map((i) => i.orderId)).size,
    totalCustomers: new Set(items.map((i) => i.order.userId)).size,
    storeRating: store.rating,
  });
});

route("GET /seller/dashboard/recent-orders", (ctx) => {
  const { store } = myStore(ctx);
  const db = getDB();
  return ok(
    storeOrders(store.id)
      .slice(0, Number(ctx.query.limit) || 5)
      .map((o) => {
        const view = sellerOrderView(db, o, store.id);
        return { id: o.id, status: o.status, createdAt: o.createdAt, customer: view.user, items: view.items, sellerSubtotal: view.items.reduce((a: number, i: Row) => a + i.totalPrice, 0) };
      })
  );
});

route("GET /seller/dashboard/inventory", (ctx) => {
  const { store } = myStore(ctx);
  const mine = getDB().products.filter((p) => p.storeId === store.id && p.status !== "PRIVATE");
  return ok({
    totalProducts: mine.length,
    publishedCount: mine.filter((p) => p.status === "PUBLISHED").length,
    draftCount: mine.filter((p) => p.status === "DRAFT").length,
    outOfStockCount: mine.filter((p) => p.stock === 0).length,
    lowStockThreshold: 5,
    lowStockProducts: mine.filter((p) => p.stock <= 5).sort((a, b) => a.stock - b.stock).slice(0, 10).map((p) => ({ ...p, images: p.images })),
  });
});

route("GET /seller/dashboard/sales-overview", (ctx) => {
  const { store } = myStore(ctx);
  const days = Number(ctx.query.days) || 30;
  const items = storeItems(store.id).filter((i) => REVENUE.includes(i.order.status));
  return ok(
    Array.from({ length: days }, (_, k) => {
      const date = new Date(Date.now() - (days - 1 - k) * 86400000).toISOString().slice(0, 10);
      const today = items.filter((i) => i.order.createdAt.slice(0, 10) === date);
      // A gentle background trend so the chart isn't empty between demo orders.
      const base = (Math.sin(k / 3) + 1.4) * 9000 + (k % 7 === 5 ? 18000 : 0);
      return { date, revenue: Math.round(base + today.reduce((a, i) => a + i.totalPrice, 0)), orders: new Set(today.map((i) => i.orderId)).size + (k % 3 === 0 ? 1 : 0) };
    })
  );
});

route("GET /seller/dashboard/top-products", (ctx) => {
  const { store } = myStore(ctx);
  const db = getDB();
  return ok(
    db.products
      .filter((p) => p.storeId === store.id && p.status !== "PRIVATE")
      .sort((a, b) => b.sold - a.sold)
      .slice(0, Number(ctx.query.limit) || 5)
      .map((p) => ({ product: { ...p, images: p.images.slice(0, 1) }, unitsSold: p.sold, revenue: p.sold * p.price }))
  );
});

route("GET /seller/dashboard/analytics", (ctx) => {
  const { store } = myStore(ctx);
  const db = getDB();
  const orders = storeOrders(store.id);
  const breakdown: Record<string, number> = {};
  orders.forEach((o) => (breakdown[o.status] = (breakdown[o.status] ?? 0) + 1));
  const byCategory = new Map<string, Row>();
  storeItems(store.id)
    .filter((i) => REVENUE.includes(i.order.status))
    .forEach((i) => {
      const c = db.categories.find((x) => x.id === productById(db, i.productId)?.categoryId)!;
      const row = byCategory.get(c.id) ?? { categoryId: c.id, categoryName: c.name, revenue: 0 };
      row.revenue += i.totalPrice;
      byCategory.set(c.id, row);
    });
  return ok({ orderStatusBreakdown: breakdown, revenueByCategory: [...byCategory.values()].sort((a, b) => b.revenue - a.revenue) });
});

route("GET /seller/dashboard/customers", (ctx) => {
  const { store } = myStore(ctx);
  const db = getDB();
  const byUser = new Map<string, Row>();
  storeItems(store.id)
    .filter((i) => REVENUE.includes(i.order.status))
    .forEach((i) => {
      const u = userById(db, i.order.userId);
      const row = byUser.get(i.order.userId) ?? { user: { id: u?.id, name: u?.name, avatar: u?.avatar }, orders: new Set<string>(), totalSpent: 0, lastOrderAt: i.order.createdAt };
      row.orders.add(i.orderId);
      row.totalSpent += i.totalPrice;
      if (i.order.createdAt > row.lastOrderAt) row.lastOrderAt = i.order.createdAt;
      byUser.set(i.order.userId, row);
    });
  const list = [...byUser.values()].map(({ orders, ...rest }): Row => ({ ...rest, totalOrders: orders.size })).sort((a, b) => b.lastOrderAt.localeCompare(a.lastOrderAt));
  return ok(paginate(list, ctx.query, "customers"));
});

route("GET /seller/dashboard/traffic", (ctx) => {
  myStore(ctx);
  const days = Number(ctx.query.days) || 30;
  const dailyViews = Array.from({ length: days }, (_, k) => ({ date: new Date(Date.now() - (days - 1 - k) * 86400000).toISOString().slice(0, 10), views: Math.round(20 + 14 * Math.sin(k / 2.5) + (k % 6 === 0 ? 25 : 0)) }));
  return ok({ totalViews: dailyViews.reduce((a, d) => a + d.views, 0), uniqueVisitors: 312, followersCount: getDB().follows.filter((f) => f.storeId === myStore(ctx).store.id).length, dailyViews });
});

route("GET /seller/dashboard/customer-map", (ctx) => {
  myStore(ctx);
  const tally = (areas: [string, number][]) => ({
    total: areas.reduce((a, [, n]) => a + n, 0),
    unknown: 0,
    states: [
      { state: "Lagos", count: areas.reduce((a, [, n]) => a + n, 0), delivers: true, otherAreas: 0, areas: areas.map(([area, count]) => ({ area, count, delivers: true, listed: true })) },
    ],
  });
  return ok({ days: Number(ctx.query.days) || 90, orders: tally([["Lekki", 9], ["Ikeja", 5], ["Surulere", 4], ["Yaba", 3], ["Victoria Island", 2]]), interested: tally([["Ajah", 6], ["Festac", 4], ["Ikoyi", 3]]) });
});

const balance = (storeId: string) => {
  const items = storeItems(storeId).filter((i) => i.status === "DELIVERED");
  const earned = items.reduce((a, i) => a + i.totalPrice * (1 - i.commissionRate / 100), 0);
  const paidOut = getDB().payouts.filter((p) => p.storeId === storeId).reduce((a, p) => a + p.amount, 0);
  return { totalRevenue: Math.round(earned), totalPaidOut: Math.round(paidOut), availableBalance: Math.max(0, Math.round(earned - paidOut)) };
};
route("GET /seller/dashboard/earnings", (ctx) => ok(balance(myStore(ctx).store.id)));
route("GET /seller/dashboard/payouts", (ctx) => {
  const { store } = myStore(ctx);
  const payouts = getDB().payouts.filter((p) => p.storeId === store.id).map((p) => ({ id: p.id, amount: p.amount, note: null, method: "TRANSFER", status: "PAID", bankLabel: "GTBank ••••4821", createdAt: p.createdAt }));
  return ok(paginate(payouts, ctx.query, "payouts"));
});

// What's coming and when (held until delivery + return window).
route("GET /seller/payouts", (ctx) => {
  const { store } = myStore(ctx);
  const db = getDB();
  const orders = storeOrders(store.id)
    .map((o) => {
      const items = o.items.filter((i: Row) => productById(db, i.productId)?.storeId === store.id);
      const amount = Math.round(items.reduce((a: number, i: Row) => a + i.totalPrice * (1 - i.commissionRate / 100), 0) + (o.shipping.find((s: Row) => s.storeId === store.id)?.fee ?? 0));
      const delivered = items.every((i: Row) => i.deliveryConfirmedAt);
      const confirmed = items.map((i: Row) => i.deliveryConfirmedAt).filter(Boolean).sort().pop();
      const releaseAt = delivered && confirmed ? new Date(new Date(confirmed).getTime() + 3 * 86400000).toISOString() : null;
      const state = !delivered ? "AWAITING_DELIVERY" : releaseAt && new Date(releaseAt) > new Date() ? "IN_RETURN_WINDOW" : "PAID";
      return { orderId: o.id, orderNumber: orderNumber(o.id), orderedAt: o.createdAt, state, amount, releaseAt, items: items.map((i: Row) => ({ title: i.productTitle, quantity: i.quantity })) };
    })
    .filter((u) => u.state !== "PAID");
  const totals = { AWAITING_DELIVERY: 0, IN_RETURN_WINDOW: 0, ON_HOLD: 0, READY: 0, PROCESSING: 0 } as Record<string, number>;
  orders.forEach((u) => (totals[u.state] += u.amount));
  const payouts = db.payouts.filter((p) => p.storeId === store.id);
  return ok({
    holdPayouts: true,
    automaticTransfers: true,
    bankAccount: "GTBank ••••4821",
    bankOnHoldUntil: null,
    totals,
    totalPaidOut: payouts.reduce((a, p) => a + p.amount, 0),
    orders,
    payouts: payouts.map((p) => ({ id: p.id, amount: p.amount, method: "TRANSFER", status: "PAID", bankLabel: "GTBank ••••4821", note: null, createdAt: p.createdAt, orderCount: p.orders })),
    earlierBalance: 0,
  });
});

route("GET /seller/me/readiness", (ctx) => {
  myStore(ctx);
  return ok({ ready: true, missing: [] });
});

// ---- store ----
route("GET /stores/me", (ctx) => {
  const { user, store } = myStore(ctx);
  return ok(storeView(getDB(), store, user.id));
});
route("PATCH /stores/:id", (ctx) => {
  const { user, store } = myStore(ctx);
  if (store.id !== ctx.params.id) return fail(403, "That's not your store.");
  const allowed = ["name", "description", "logo", "banner", "address", "city", "state", "phone", "email", "instagram", "whatsapp", "facebook", "tiktok", "shippingPolicy", "warrantyPolicy", "brandColor"];
  for (const key of allowed) if (key in ctx.body) store[key] = ctx.body[key];
  // Same as the API: "#73e" / "7C3AED" -> "#7c3aed"; blank = Nestly's colours.
  if ("brandColor" in ctx.body) {
    const hex = String(ctx.body.brandColor ?? "").trim().replace(/^#/, "").toLowerCase();
    const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
    if (full && !/^[0-9a-f]{6}$/.test(full)) return fail(400, "Pick a colour, e.g. #7C3AED.");
    store.brandColor = full ? `#${full}` : null;
  }
  return ok(storeView(getDB(), store, user.id), "Store updated");
});

// ---- products ----
route("GET /products/ai-draft/status", () => ok({ enabled: false, remainingToday: 0 }));

route("GET /products/me", (ctx) => {
  const { store } = myStore(ctx);
  const db = getDB();
  let mine = db.products.filter((p) => p.storeId === store.id && p.status !== "PRIVATE");
  if (ctx.query.status) mine = mine.filter((p) => p.status === ctx.query.status);
  if (ctx.query.search) mine = mine.filter((p) => p.title.toLowerCase().includes(String(ctx.query.search).toLowerCase()));
  return ok(paginate(mine.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((p) => productCard(db, p)), ctx.query, "products"));
});
route("GET /products/me/:id", (ctx) => {
  const { store } = myStore(ctx);
  const db = getDB();
  const p = db.products.find((x) => x.id === ctx.params.id && x.storeId === store.id);
  return p ? ok({ ...productCard(db, p), category: db.categories.find((c) => c.id === p.categoryId) }) : fail(404, "Product not found.");
});
route("POST /products", (ctx) => {
  const { store } = myStore(ctx);
  const db = getDB();
  const b = ctx.body;
  const id = newId();
  const product = {
    id,
    storeId: store.id,
    categoryId: b.categoryId,
    title: String(b.title),
    slug: String(b.title).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    description: String(b.description ?? ""),
    sku: String(b.sku ?? `SKU-${id.slice(-5)}`),
    brand: b.brand ?? null,
    condition: b.condition ?? "NEW",
    deliveryVehicle: b.deliveryVehicle ?? "BIKE",
    status: "DRAFT",
    isFeatured: false,
    highlights: (b.highlights as string[]) ?? [],
    price: Number(b.price),
    originalPrice: b.originalPrice ? Number(b.originalPrice) : null,
    stock: Number(b.stock ?? 1),
    reviewsResetAt: null,
    createdAt: now(),
    updatedAt: now(),
    images: ((b.images as Row[]) ?? []).map((img, i) => ({ id: newId(), productId: id, url: img.url, isPrimary: img.isPrimary ?? i === 0 })),
    specifications: (b.specifications as Row[]) ?? [],
    options: [],
    variations: [],
    views: 0,
    sold: 0,
  };
  db.products.push(product);
  return created(productCard(db, product), "Product created");
});
route("PATCH /products/:id", (ctx) => {
  const { store } = myStore(ctx);
  const db = getDB();
  const p = db.products.find((x) => x.id === ctx.params.id && x.storeId === store.id);
  if (!p) return fail(404, "Product not found.");
  const wasDraft = p.status !== "PUBLISHED";
  for (const key of ["title", "description", "price", "originalPrice", "stock", "status", "categoryId", "highlights", "condition", "deliveryVehicle", "brand", "sku", "specifications"]) if (key in ctx.body) p[key] = ctx.body[key];
  if (ctx.body.images) p.images = (ctx.body.images as Row[]).map((img, i) => ({ id: newId(), productId: p.id, url: img.url, isPrimary: img.isPrimary ?? i === 0 }));
  if (p.status === "OUT_OF_STOCK" && p.stock > 0) p.status = "PUBLISHED";
  p.updatedAt = now();
  if (wasDraft && p.status === "PUBLISHED") p.createdAt = now(); // shows up as a new drop in the feed
  return ok(productCard(db, p), "Product updated");
});
route("DELETE /products/:id", (ctx) => {
  const { store } = myStore(ctx);
  const p = getDB().products.find((x) => x.id === ctx.params.id && x.storeId === store.id);
  if (p) p.status = "ARCHIVED";
  return ok(null, "Product archived");
});

// ---- orders (seller) ----
route("GET /orders/seller", (ctx) => {
  const { store } = myStore(ctx);
  const db = getDB();
  let orders = storeOrders(store.id);
  if (ctx.query.status) orders = orders.filter((o) => o.status === ctx.query.status);
  return ok(paginate(orders.map((o) => sellerOrderView(db, o, store.id)), ctx.query, "orders"));
});
route("GET /orders/seller/:id", (ctx) => {
  const { store } = myStore(ctx);
  const db = getDB();
  const order = storeOrders(store.id).find((o) => o.id === ctx.params.id);
  return order ? ok(sellerOrderView(db, order, store.id)) : fail(404, "Order not found.");
});
route("PATCH /orders/seller/items/:itemId/status", (ctx) => {
  const { store } = myStore(ctx);
  const db = getDB();
  const order = storeOrders(store.id).find((o) => o.items.some((i: Row) => i.id === ctx.params.itemId));
  const item = order?.items.find((i: Row) => i.id === ctx.params.itemId);
  if (!order || !item) return fail(404, "Order item not found.");
  const status = String(ctx.body.status);
  if (status === "DELIVERED") {
    const shipping = order.shipping.find((s: Row) => s.storeId === store.id);
    const code = String(ctx.body.deliveryCode ?? "");
    if (!code) return fail(400, "Ask the buyer for their 6-digit delivery code.");
    if (code !== shipping.deliveryCode) {
      shipping.deliveryCodeAttempts += 1;
      return fail(400, `That code doesn't match. ${Math.max(0, 5 - shipping.deliveryCodeAttempts)} attempts left.`);
    }
  }
  advanceItem(db, order, item, status);
  const label = { PROCESSING: "is being prepared 👩‍🍳", SHIPPED: "is on the way 🚚", DELIVERED: "was delivered ✅" }[status] ?? "was updated";
  notify(db, order.userId, `Your order ${label}`, `${store.name}: order ${orderNumber(order.id)} ${label}.`, { type: "ORDER", id: order.id }, "ORDER");
  return ok(sellerOrderView(db, order, store.id), "Order item status updated successfully");
});

// ---- lives (seller) ----
route("GET /lives/me", (ctx) => {
  const { store } = myStore(ctx);
  const db = getDB();
  return ok({
    canGoLive: true,
    blockers: [],
    videoReady: true,
    maxMinutes: 60,
    lives: db.lives.filter((l) => l.storeId === store.id).map((l) => ({ ...liveCard(l), referralCode: store.referralCode, orders: l.status === "ENDED" ? 6 : 0, revenue: l.status === "ENDED" ? 54000 : 0 })),
  });
});

route("GET /returns/seller", (ctx) => {
  myStore(ctx);
  return ok(paginate([], ctx.query, "returns"));
});
route("GET /returns", (ctx) => {
  needUser(ctx);
  return ok(paginate([], ctx.query, "returns"));
});
route("GET /referrals/me", (ctx) => {
  const { store } = myStore(ctx);
  return ok({ code: store.referralCode, rewardPercent: 2, rewardDays: 90, visitsLast30Days: 186, visitsTotal: 642, buyersJoined: 7, ordersFromReferrals: 11, salesFromReferrals: 214500, commissionSaved: 4290 });
});

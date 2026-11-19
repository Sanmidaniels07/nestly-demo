// Admin: marketplace overview, sellers (review / reject), products, users,
// payouts and money held.

import { getDB, type Row } from "../db";
import { notify, productById, storeById, userById } from "../model";
import { DemoError, fail, ok, paginate, route, type Ctx } from "../router";
import { naira, now, orderNumber } from "../util";

const needAdmin = (ctx: Ctx) => {
  if (!ctx.user) throw new DemoError(401, "Please log in to continue.");
  if (ctx.user.role !== "ADMIN") throw new DemoError(403, "Admins only.");
  return ctx.user;
};

const REVENUE = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

route("GET /admin/overview", (ctx) => {
  needAdmin(ctx);
  const db = getDB();
  const days = Number(ctx.query.days) || 30;
  const paid = db.orders.filter((o) => REVENUE.includes(o.status));
  const sales = paid.reduce((a, o) => a + o.subtotal, 0);
  const commission = paid.reduce((a, o) => a + o.items.reduce((s: number, i: Row) => s + (i.totalPrice * i.commissionRate) / 100, 0), 0);
  // The demo marketplace is busier than its handful of seeded orders.
  const scale = 38;
  const daily = Array.from({ length: days }, (_, k) => {
    const date = new Date(Date.now() - (days - 1 - k) * 86400000).toISOString().slice(0, 10);
    const wave = Math.round(18 + 9 * Math.sin(k / 3) + k * 0.8);
    return { date, signups: Math.round(wave * 0.6), orders: wave, sales: wave * 21500 };
  });
  const byStore = new Map<string, Row>();
  paid.forEach((o) =>
    o.shipping.forEach((s: Row) => {
      const store = storeById(db, s.storeId)!;
      const row = byStore.get(store.id) ?? { id: store.id, name: store.name, slug: store.slug, orders: 0, sales: 0 };
      row.orders += scale / 4;
      row.sales += o.subtotal * (scale / 4);
      byStore.set(store.id, row);
    })
  );
  return ok({
    range: { days, since: daily[0].date, until: now() },
    users: { total: 12840, new: 1240, newPrev: 860, active: 6210, google: 3100, verified: 11900, suspended: 12, banned: 3 },
    sellers: { pending: 2, approved: 1284, rejected: 41, verified: 690, readyToSell: 1120, newApplications: 96, newApplicationsPrev: 71, stores: 1284, suspendedStores: 9 },
    products: { live: 18420, soldOut: 640, drafts: 1210, paymentLinkItems: 3900 },
    orders: {
      paid: paid.length * scale,
      paidPrev: Math.round(paid.length * scale * 0.72),
      sales: sales * scale,
      salesPrev: Math.round(sales * scale * 0.7),
      commission: Math.round(commission * scale),
      commissionPrev: Math.round(commission * scale * 0.7),
      averageOrder: Math.round(sales / Math.max(1, paid.length)),
      deliveryFees: paid.reduce((a, o) => a + o.deliveryFee, 0) * scale,
      paymentLinkOrders: 212,
      paymentLinkSales: 4120000,
      unpaidCheckouts: 31,
      cancelled: 18,
      refundsToDo: 0,
    },
    sources: {
      signups: [
        { source: "PAYMENT_LINK", count: 410 },
        { source: "INSTAGRAM", count: 380 },
        { source: "WHATSAPP", count: 290 },
        { source: "DIRECT", count: 160 },
      ],
      orders: [
        { source: "PAYMENT_LINK", orders: 212, sales: 4120000 },
        { source: "MARKETPLACE", orders: 180, sales: 3610000 },
        { source: "LIVE", orders: 64, sales: 1290000 },
        { source: "FEED", orders: 52, sales: 980000 },
      ],
    },
    engagement: { productViews: 48200, storeViews: 21900, profileViews: 9100 },
    daily,
    topStores: [...byStore.values()].sort((a, b) => b.sales - a.sales).slice(0, 5),
    topProducts: [...db.products]
      .filter((p) => p.status !== "PRIVATE")
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 6)
      .map((p) => ({ id: p.id, title: p.title, storeName: storeById(db, p.storeId)?.name, isPaymentLink: false, units: p.sold * 4, sales: p.sold * 4 * p.price })),
  });
});

const sellerRow = (s: Row) => {
  const db = getDB();
  const user = userById(db, s.userId)!;
  const store = db.stores.find((x) => x.sellerId === s.id);
  const openOrders = store ? db.orders.filter((o) => o.status !== "PENDING" && o.status !== "CANCELLED" && o.status !== "DELIVERED" && o.shipping.some((x: Row) => x.storeId === store.id)) : [];
  return {
    ...s,
    cacCheckResult: s.isVerified ? "MATCH" : null,
    cacCheckedName: s.isVerified ? store?.name.toUpperCase() : null,
    cacCheckedStatus: s.isVerified ? "ACTIVE" : null,
    cacCheckedAt: s.isVerified ? s.statusUpdatedAt : null,
    user: { id: user.id, name: user.name, email: user.email, username: user.username, avatar: user.avatar },
    store: store ? { id: store.id, name: store.name, slug: store.slug, isSuspended: store.isSuspended, underReview: store.underReview, createdAt: store.createdAt, salesStoppedAt: store.salesStoppedAt } : null,
    activity: store ? { orders: db.orders.filter((o) => o.shipping.some((x: Row) => x.storeId === store.id) && o.status !== "PENDING").length, openOrders: openOrders.length, held: openOrders.reduce((a, o) => a + o.subtotal, 0), bank: store.payoutBankName } : null,
  };
};

route("GET /admin/sellers", (ctx) => {
  needAdmin(ctx);
  const db = getDB();
  let list = [...db.sellers];
  if (ctx.query.status) list = list.filter((s) => s.status === ctx.query.status);
  if (ctx.query.needsReview === "true") list = list.filter((s) => db.stores.find((x) => x.sellerId === s.id)?.underReview);
  return ok(paginate(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(sellerRow), ctx.query, "sellers"));
});

route("GET /admin/sellers/:id/open-orders", (ctx) => {
  needAdmin(ctx);
  const db = getDB();
  const seller = db.sellers.find((s) => s.id === ctx.params.id);
  const store = seller ? db.stores.find((x) => x.sellerId === seller.id) : null;
  const open = store ? db.orders.filter((o) => ["PAID", "PROCESSING", "SHIPPED"].includes(o.status) && o.shipping.some((x: Row) => x.storeId === store.id)) : [];
  const amount = open.reduce((a, o) => a + o.total, 0);
  return ok({ openOrders: open.length, openAmount: amount, refundableOrders: open.length, refundableAmount: amount, manualOrders: 0, heldAmount: Math.round(amount * 0.92) });
});

route("PATCH /admin/sellers/:id/status", (ctx) => {
  needAdmin(ctx);
  const db = getDB();
  const seller = db.sellers.find((s) => s.id === ctx.params.id);
  if (!seller) return fail(404, "Seller not found.");
  const store = db.stores.find((x) => x.sellerId === seller.id);
  const status = String(ctx.body.status);
  const fraud = status === "REJECTED" && ctx.body.rejectMode === "FRAUD";
  seller.status = status;
  seller.statusReason = status === "APPROVED" ? null : (ctx.body.reason as string) ?? null;
  seller.statusUpdatedAt = now();
  let refunds: Row | null = null;
  if (store) {
    if (status === "APPROVED") {
      const wasReview = store.underReview;
      Object.assign(store, { underReview: false, isSuspended: false, salesStoppedAt: null });
      if (wasReview) notify(db, seller.userId, "Your store has been reviewed ✅", `${store.name} is fully set up: payouts are released as usual and the order limit for new stores no longer applies.`, { type: "SELLER_EARNINGS", id: store.id });
    } else if (fraud) {
      Object.assign(store, { isSuspended: true, underReview: true, salesStoppedAt: null });
      const open = db.orders.filter((o) => ["PAID", "PROCESSING", "SHIPPED"].includes(o.status) && o.shipping.some((x: Row) => x.storeId === store.id));
      open.forEach((o) => {
        o.status = "CANCELLED";
        o.refundStatus = "PROCESSED";
        o.cancelReason = "The seller's store was closed by Nestly. You've been refunded in full.";
        notify(db, o.userId, "Order refunded", `Order ${orderNumber(o.id)} was cancelled and ${naira(o.total)} refunded to you.`, { type: "ORDER", id: o.id }, "ORDER");
      });
      refunds = { refunded: open.length, refundedAmount: open.reduce((a, o) => a + o.total, 0), failed: 0, manual: 0, refundedAmountLabel: naira(open.reduce((a, o) => a + o.total, 0)) };
    } else {
      Object.assign(store, { isSuspended: true, salesStoppedAt: now(), underReview: false });
    }
  }
  return ok({ ...sellerRow(seller), refunds }, "Seller status updated successfully");
});

route("PATCH /admin/sellers/:id/verify", (ctx) => {
  needAdmin(ctx);
  const db = getDB();
  const seller = db.sellers.find((s) => s.id === ctx.params.id);
  if (!seller) return fail(404, "Seller not found.");
  seller.isVerified = !!ctx.body.isVerified;
  const store = db.stores.find((x) => x.sellerId === seller.id);
  if (store) store.isVerified = seller.isVerified;
  return ok(sellerRow(seller));
});

route("GET /admin/products", (ctx) => {
  needAdmin(ctx);
  const db = getDB();
  const q = String(ctx.query.search ?? "").toLowerCase();
  const list = db.products
    .filter((p) => p.status !== "PRIVATE" && (!q || p.title.toLowerCase().includes(q)))
    .map((p) => {
      const store = storeById(db, p.storeId)!;
      return { id: p.id, title: p.title, sku: p.sku, status: p.status, price: p.price, isFeatured: p.isFeatured, updatedAt: p.updatedAt, reviewsResetAt: null, images: p.images.slice(0, 1).map((i: Row) => ({ url: i.url })), store: { id: store.id, name: store.name, slug: store.slug }, _count: { revisions: 1, reviews: db.reviews.filter((r) => r.productId === p.id).length } };
    });
  return ok(paginate(list, ctx.query, "products"));
});
route("PATCH /admin/products/:id/featured", (ctx) => {
  needAdmin(ctx);
  const p = productById(getDB(), ctx.params.id);
  if (!p) return fail(404, "Product not found.");
  p.isFeatured = !!ctx.body.isFeatured;
  return ok({ id: p.id, isFeatured: p.isFeatured });
});

route("GET /admin/users", (ctx) => {
  needAdmin(ctx);
  const q = String(ctx.query.search ?? "").toLowerCase();
  const list = getDB()
    .users.filter((u) => !u.isGuest && (!q || u.name.toLowerCase().includes(q) || u.email.includes(q)))
    .map((u) => ({ id: u.id, name: u.name, email: u.email, username: u.username, avatar: u.avatar, role: u.role, status: u.status ?? "ACTIVE", statusReason: null, isVerified: true, createdAt: u.createdAt, deletedAt: null }));
  return ok(paginate(list, ctx.query, "users"));
});
route("PATCH /admin/users/:id/status", (ctx) => {
  needAdmin(ctx);
  const u = userById(getDB(), ctx.params.id);
  if (!u) return fail(404, "User not found.");
  u.status = ctx.body.status;
  return ok({ id: u.id, status: u.status });
});

route("GET /admin/payouts", (ctx) => {
  needAdmin(ctx);
  const db = getDB();
  const list = db.payouts.map((p) => {
    const store = storeById(db, p.storeId)!;
    return { id: p.id, amount: p.amount, status: "PAID", method: "TRANSFER", bankLabel: "GTBank ••••4821", note: null, reference: p.reference, createdAt: p.createdAt, store: { id: store.id, name: store.name, slug: store.slug } };
  });
  return ok(paginate(list, ctx.query, "payouts"));
});

route("GET /admin/payouts/held", (ctx) => {
  needAdmin(ctx);
  const db = getDB();
  const stores = db.stores
    .map((store) => {
      const open = db.orders.filter((o) => REVENUE.includes(o.status) && o.shipping.some((x: Row) => x.storeId === store.id));
      const totals = { AWAITING_DELIVERY: 0, IN_RETURN_WINDOW: 0, ON_HOLD: 0, READY: 0, PROCESSING: 0 } as Record<string, number>;
      open.forEach((o) => {
        const amount = Math.round(o.subtotal * 0.92);
        if (o.status === "DELIVERED") {
          const confirmed = o.items.map((i: Row) => i.deliveryConfirmedAt).filter(Boolean).sort().pop();
          if (confirmed && Date.now() - new Date(confirmed).getTime() < 3 * 86400000) totals.IN_RETURN_WINDOW += amount;
        } else totals.AWAITING_DELIVERY += amount;
      });
      return { id: store.id, name: store.name, slug: store.slug, bankAccount: store.payoutBankName ? `${store.payoutBankName} ••••${String(store.payoutAccountNumber).slice(-4)}` : null, bankOnHoldUntil: null, totals, underReview: store.underReview };
    })
    .filter((s) => Object.values(s.totals).some((v) => v > 0));
  return ok({ holdPayouts: true, automaticTransfers: true, stores, failedTransfers: [] });
});

route("GET /returns/admin", (ctx) => {
  needAdmin(ctx);
  return ok(paginate([], ctx.query, "returns"));
});

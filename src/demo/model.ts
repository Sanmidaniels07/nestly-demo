// Turns demo rows into the exact shapes the real API returns, and holds the
// shared business rules (orders, payment, delivery codes, notifications) so
// the history and the live handlers behave the same.

import type { DemoDB, Row } from "./db";
import { code6, newId, now, orderNumber } from "./util";

// ---------- lookups ----------
export const userById = (db: DemoDB, id: string | null | undefined) => db.users.find((u) => u.id === id) ?? null;
export const storeById = (db: DemoDB, id: string | null | undefined) => db.stores.find((s) => s.id === id) ?? null;
export const productById = (db: DemoDB, id: string | null | undefined) => db.products.find((p) => p.id === id) ?? null;
export const categoryById = (db: DemoDB, id: string | null | undefined) => db.categories.find((c) => c.id === id) ?? null;
export const sellerOfStore = (db: DemoDB, store: Row) => db.sellers.find((s) => s.id === store.sellerId) ?? null;
export const storeOwnerId = (db: DemoDB, store: Row) => sellerOfStore(db, store)?.userId ?? null;
export const storeOfUser = (db: DemoDB, userId: string | undefined) => {
  const seller = db.sellers.find((s) => s.userId === userId);
  return seller ? db.stores.find((s) => s.sellerId === seller.id) ?? null : null;
};
export const miniUser = (u: Row | null) => (u ? { id: u.id, name: u.name, username: u.username, avatar: u.avatar } : null);

// ---------- products ----------
export const isListed = (db: DemoDB, p: Row) => p.status === "PUBLISHED" && !storeById(db, p.storeId)?.isSuspended;

export const productCard = (db: DemoDB, p: Row) => {
  const store = storeById(db, p.storeId)!;
  const category = categoryById(db, p.categoryId)!;
  const reviews = db.reviews.filter((r) => r.productId === p.id);
  return {
    ...p,
    category: { id: category.id, name: category.name, slug: category.slug },
    store: { id: store.id, name: store.name, slug: store.slug, logo: store.logo, isVerified: store.isVerified, city: store.city, state: store.state },
    averageRating: reviews.length ? Math.round((reviews.reduce((a, r) => a + r.rating, 0) / reviews.length) * 10) / 10 : 0,
    reviewCount: reviews.length,
    _count: { reviews: reviews.length },
  };
};

export const productDetail = (db: DemoDB, p: Row, viewerId?: string | null) => {
  const store = storeById(db, p.storeId)!;
  const category = categoryById(db, p.categoryId)!;
  const card = productCard(db, p);
  return {
    ...card,
    category,
    store: {
      id: store.id,
      name: store.name,
      slug: store.slug,
      logo: store.logo,
      city: store.city,
      state: store.state,
      isVerified: store.isVerified,
      isSuspended: store.isSuspended,
      sellerUserId: storeOwnerId(db, store),
      canDeliver: true,
    },
    isWishlisted: !!viewerId && db.wishlist.some((w) => w.userId === viewerId && w.productId === p.id),
  };
};

// ---------- stores ----------
export const storeFollowers = (db: DemoDB, storeId: string) => db.follows.filter((f) => f.storeId === storeId).length;

export const storeView = (db: DemoDB, s: Row, viewerId?: string | null) => {
  const seller = sellerOfStore(db, s)!;
  const owner = userById(db, seller.userId);
  const ownerOrAdmin = viewerId === seller.userId || userById(db, viewerId)?.role === "ADMIN";
  const { email, phone, whatsapp, instagram, ...rest } = s;
  return {
    ...rest,
    ...(ownerOrAdmin ? { email, phone, whatsapp, instagram } : {}),
    seller: { id: seller.id, status: seller.status, isVerified: seller.isVerified, user: { id: owner?.id, name: owner?.name, avatar: owner?.avatar, username: owner?.username } },
    shippingOptions: db.shippingOptions.filter((o) => o.storeId === s.id && !o.isArchived),
    followersCount: storeFollowers(db, s.id),
    isFollowing: !!viewerId && db.follows.some((f) => f.followerId === viewerId && f.storeId === s.id),
    productCount: db.products.filter((p) => p.storeId === s.id && isListed(db, p)).length,
  };
};

export const trustRecord = (db: DemoDB, s: Row) => {
  const items = db.orders.filter((o) => o.status !== "PENDING").flatMap((o) => o.items.filter((i: Row) => productById(db, i.productId)?.storeId === s.id));
  const delivered = new Set(items.filter((i: Row) => i.status === "DELIVERED").map((i: Row) => i.orderId)).size + s.totalSales;
  const reviews = db.reviews.filter((r) => productById(db, r.productId)?.storeId === s.id);
  const rating = reviews.length ? Math.round((reviews.reduce((a, r) => a + r.rating, 0) / reviews.length) * 10) / 10 : null;
  const level = s.underReview ? "NEW" : s.isVerified && delivered >= 20 ? "TRUSTED" : delivered >= 5 ? "ESTABLISHED" : "NEW";
  return {
    store: { name: s.name, slug: s.slug, logo: s.logo, city: s.city, state: s.state },
    level,
    verifiedBusiness: s.isVerified,
    newlyReviewed: !s.underReview,
    sellingSince: s.createdAt,
    deliveredOrders: delivered,
    completionRate: delivered >= 5 ? 98.5 : null,
    typicalShipHours: 6,
    refundRate: delivered >= 5 ? 0.8 : null,
    problemReports: 0,
    rating,
    reviewCount: reviews.length,
    followers: storeFollowers(db, s.id),
    updatedAt: now(),
  };
};

// ---------- notifications ----------
export const notify = (db: DemoDB, userId: string, title: string, message: string, target?: { type: string; id: string }, type = "SYSTEM") => {
  const row = { id: newId(), userId, type, title, message, targetType: target?.type ?? null, targetId: target?.id ?? null, isRead: false, createdAt: now() };
  db.notifications.unshift(row);
  // Live updates for whoever is watching (see fake-socket / activity).
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("nestly-demo:notification", { detail: row }));
  return row;
};

// ---------- orders ----------
export const STEPS = ["PENDING", "PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

interface NewOrder {
  userId: string;
  lines: { productId: string; quantity: number; unitPrice?: number; title?: string }[];
  addressId?: string | null;
  address?: Row | null;
  /** storeId -> shipping option id (or an ad-hoc option row for payment links). */
  shipping: Record<string, string | Row>;
  source?: string;
  paymentLinkId?: string | null;
  liveSessionId?: string | null;
  deliveryPhone?: string;
  note?: string;
  createdAt?: string;
}

export const createOrder = (db: DemoDB, input: NewOrder) => {
  const id = newId();
  const createdAt = input.createdAt ?? now();
  const items = input.lines.map((line) => {
    const p = productById(db, line.productId)!;
    const category = categoryById(db, p.categoryId)!;
    const unit = line.unitPrice ?? p.price;
    return {
      id: newId(),
      orderId: id,
      productId: p.id,
      quantity: line.quantity,
      unitPrice: unit,
      totalPrice: unit * line.quantity,
      commissionRate: category.commissionRate,
      autoPaidViaSplit: false,
      referralReward: false,
      productTitle: line.title ?? p.title,
      productImage: p.images[0]?.url ?? null,
      productDescription: p.description,
      productBrand: null,
      productCondition: "NEW",
      productSku: p.sku,
      productHighlights: p.highlights,
      variantLabel: null,
      variationId: null,
      productSpecs: [],
      status: "PENDING",
      shippedAt: null,
      deliveredAt: null,
      deliveryConfirmedAt: null,
      deliveryConfirmedBy: null,
    };
  });
  const storeIds = [...new Set(items.map((i) => productById(db, i.productId)!.storeId))];
  const shipping = storeIds.map((storeId) => {
    const choice = input.shipping[storeId];
    const option = typeof choice === "string" ? db.shippingOptions.find((o) => o.id === choice) : choice;
    const store = storeById(db, storeId)!;
    return {
      id: newId(),
      orderId: id,
      storeId,
      optionName: option?.name ?? "Delivery",
      fee: option?.fee ?? 0,
      eta: option?.eta ?? null,
      type: option?.type ?? "DELIVERY",
      pickupAddress: option?.type === "PICKUP" ? option.pickupAddress ?? store.address : null,
      vehicle: option?.vehicle ?? null,
      deliveryCode: null as string | null,
      deliveryCodeAttempts: 0,
      paidViaSplit: !store.underReview,
      heldForPayout: !!store.underReview,
      payoutId: null,
      settledAt: null,
      createdAt,
    };
  });
  const subtotal = items.reduce((a, i) => a + i.totalPrice, 0);
  const deliveryFee = shipping.reduce((a, s) => a + s.fee, 0);
  const address = input.address ?? db.addresses.find((a) => a.id === input.addressId) ?? null;
  const order = {
    id,
    userId: input.userId,
    addressId: address?.id ?? null,
    status: "PENDING",
    subtotal,
    deliveryFee,
    tax: 0,
    discountAmount: 0,
    couponCode: null,
    total: subtotal + deliveryFee,
    paymentMethod: "PAYSTACK",
    paymentReference: `NESTLY_${newId().slice(-24)}`,
    trackingNumber: null,
    deliveryPhone: input.deliveryPhone ?? address?.phone ?? null,
    paymentLinkId: input.paymentLinkId ?? null,
    liveSessionId: input.liveSessionId ?? null,
    cancelReason: null,
    refundStatus: null,
    source: input.source ?? "CHECKOUT",
    createdAt,
    updatedAt: createdAt,
    items,
    address,
    shipping,
    sellerNotes: input.note ? storeIds.map((storeId) => ({ storeId, note: input.note })) : [],
    events: [] as Row[],
  };
  db.orders.unshift(order);
  return order;
};

export const addEvent = (order: Row, type: string, at = now(), orderItemId: string | null = null, actor = "SYSTEM") =>
  order.events.push({ id: newId(), orderItemId, type, actor, note: null, createdAt: at });

/** Payment confirmed: stock taken, codes made, seller and buyer told. */
export const markPaid = (db: DemoDB, order: Row, at = now(), quiet = false) => {
  if (order.status !== "PENDING") return order;
  order.status = "PAID";
  order.updatedAt = at;
  for (const item of order.items) {
    const p = productById(db, item.productId);
    if (p) {
      p.stock = Math.max(0, p.stock - item.quantity);
      p.sold = (p.sold ?? 0) + item.quantity;
      if (p.stock === 0 && p.status === "PUBLISHED") p.status = "OUT_OF_STOCK";
    }
  }
  for (const s of order.shipping) s.deliveryCode = code6();
  addEvent(order, "PAID", at);
  const cart = db.carts.find((c) => c.userId === order.userId);
  if (cart && order.source === "CHECKOUT") cart.items = [];
  if (!quiet) {
    const buyer = userById(db, order.userId);
    notify(db, order.userId, "Order confirmed", `Your payment for order ${orderNumber(order.id)} went through. The seller is preparing it.`, { type: "ORDER", id: order.id }, "ORDER");
    for (const s of order.shipping) {
      const store = storeById(db, s.storeId)!;
      const ownerId = storeOwnerId(db, store);
      const lines = order.items.filter((i: Row) => productById(db, i.productId)?.storeId === s.storeId);
      if (ownerId)
        notify(db, ownerId, "New order 🎉", `${buyer?.name ?? "A buyer"} paid for ${lines.map((l: Row) => l.productTitle).join(", ")}.`, { type: "SELLER_ORDER", id: order.id }, "ORDER");
    }
  }
  return order;
};

/** Seller moves one item along. DELIVERED with the right code = delivered and confirmed. */
export const advanceItem = (db: DemoDB, order: Row, item: Row, status: string, at = now()) => {
  item.status = status;
  if (status === "SHIPPED") item.shippedAt = at;
  if (status === "DELIVERED") {
    item.deliveredAt = at;
    item.deliveryConfirmedAt = at;
    item.deliveryConfirmedBy = "CODE";
  }
  addEvent(order, status === "DELIVERED" ? "DELIVERY_CONFIRMED" : status, at, item.id, "SELLER");
  const statuses = order.items.map((i: Row) => i.status);
  order.status = statuses.every((s: string) => s === "DELIVERED")
    ? "DELIVERED"
    : statuses.some((s: string) => s === "SHIPPED" || s === "DELIVERED")
      ? "SHIPPED"
      : statuses.some((s: string) => s === "PROCESSING")
        ? "PROCESSING"
        : order.status;
  order.updatedAt = at;
};

const RETURN_DAYS = 3;

export const orderView = (db: DemoDB, o: Row) => {
  const at = (type: string) => o.events.find((e: Row) => e.type === type)?.createdAt ?? null;
  const reached = STEPS.indexOf(o.status);
  const timeline = STEPS.map((step, i) => ({
    step,
    completed: o.status !== "CANCELLED" && i <= reached,
    current: i === reached,
    at: step === "PENDING" ? o.createdAt : step === "DELIVERED" ? at("DELIVERY_CONFIRMED") : at(step),
  }));
  return {
    ...o,
    paymentLink: o.paymentLinkId ? { code: db.paymentLinks.find((l) => l.id === o.paymentLinkId)?.code } : null,
    gift: db.gifts.find((g) => g.orderId === o.id) ? { code: db.gifts.find((g) => g.orderId === o.id)!.code } : null,
    items: o.items.map((i: Row) => {
      const p = productById(db, i.productId);
      const store = p ? storeById(db, p.storeId) : null;
      const category = p ? categoryById(db, p.categoryId) : null;
      const windowEnds = i.deliveryConfirmedAt ? new Date(new Date(i.deliveryConfirmedAt).getTime() + (category?.isPerishable ? 1 : RETURN_DAYS) * 86400000).toISOString() : null;
      return {
        ...i,
        product: p ? { id: p.id, title: p.title, status: p.status, category: { isPerishable: !!category?.isPerishable }, images: p.images, store: store ? { id: store.id, name: store.name, slug: store.slug } : null } : null,
        listingChanged: false,
        awaitingConfirmation: i.status === "DELIVERED" && !i.deliveryConfirmedAt,
        perishable: !!category?.isPerishable,
        returnWindowEndsAt: windowEnds,
        returnWindowOpen: !!windowEnds && new Date(windowEnds) > new Date(),
      };
    }),
    timeline,
  };
};

/** What one seller sees of an order: only their items and no delivery code. */
export const sellerOrderView = (db: DemoDB, o: Row, storeId: string) => {
  const buyer = userById(db, o.userId);
  return {
    ...o,
    user: { id: buyer?.id, name: buyer?.name, avatar: buyer?.avatar },
    address: o.address ? { fullName: o.address.fullName, address: o.address.address, city: o.address.city, state: o.address.state, country: o.address.country, postalCode: null, latitude: o.address.latitude, longitude: o.address.longitude } : null,
    shipping: o.shipping.filter((s: Row) => s.storeId === storeId).map(({ deliveryCode, deliveryCodeAttempts, ...rest }: Row) => rest),
    sellerNotes: o.sellerNotes.filter((n: Row) => n.storeId === storeId),
    items: o.items
      .filter((i: Row) => productById(db, i.productId)?.storeId === storeId)
      .map((i: Row) => {
        const p = productById(db, i.productId);
        return { ...i, product: p ? { id: p.id, title: p.title, status: p.status, images: p.images } : null };
      }),
  };
};

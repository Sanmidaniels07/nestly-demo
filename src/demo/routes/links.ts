// Payment links (a DM deal becomes a paid order), guest checkout, group
// gifts (friends chip in), banks and locations.

import { getDB, type DemoDB, type DemoUser, type Row } from "../db";
import { createOrder, markPaid, miniUser, notify, orderView, productById, storeById, storeOfUser, storeOwnerId, userById } from "../model";
import { startPayment, whenPaid, paymentByReference } from "../payments";
import { DemoError, created, fail, needUser, ok, route, type Ctx } from "../router";
import { planOrder } from "../simulate";
import { inDays, naira, newId, now, shortCode } from "../util";

// ---------- payment links ----------
const linkProduct = (db: DemoDB, link: Row) => productById(db, link.productId)!;

const forSeller = (db: DemoDB, link: Row) => {
  const p = linkProduct(db, link);
  const orders = db.orders.filter((o) => o.paymentLinkId === link.id && o.status !== "PENDING");
  return {
    id: link.id,
    code: link.code,
    title: p.title,
    description: p.description,
    price: p.price,
    quantity: p.stock,
    images: p.images,
    category: db.categories.find((c) => c.id === p.categoryId),
    deliveryType: link.deliveryType,
    deliveryFee: link.deliveryFee,
    deliveryVehicle: p.deliveryVehicle,
    isActive: link.isActive,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
    sales: { orders: orders.length, units: orders.reduce((a, o) => a + o.items[0].quantity, 0), revenue: orders.reduce((a, o) => a + o.subtotal, 0) },
  };
};

const publicLink = (db: DemoDB, link: Row, viewerId?: string) => {
  const p = linkProduct(db, link);
  const store = storeById(db, link.storeId)!;
  const ownerId = storeOwnerId(db, store);
  return {
    code: link.code,
    title: p.title,
    description: p.description,
    price: p.price,
    images: p.images.map((i: Row) => ({ url: i.url, isPrimary: i.isPrimary })),
    category: db.categories.find((c) => c.id === p.categoryId),
    quantityAvailable: Math.max(0, p.stock),
    deliveryType: link.deliveryType,
    deliveryFee: link.deliveryFee,
    pickupAddress: link.deliveryType === "PICKUP" ? store.address : null,
    deliveryVehicle: p.deliveryVehicle,
    shippingOptions: link.deliveryType === "STORE_OPTIONS" ? db.shippingOptions.filter((o) => o.storeId === store.id && !o.isArchived) : [],
    availability: !link.isActive ? "PAUSED" : p.stock <= 0 ? "SOLD_OUT" : "AVAILABLE",
    isOwner: viewerId === ownerId,
    reserved: !!link.buyerId,
    reservedForViewer: !!viewerId && viewerId === link.buyerId,
    store: { id: store.id, name: store.name, slug: store.slug, address: store.address, logo: store.logo, city: store.city, state: store.state, isVerified: store.isVerified, rating: store.rating, sellerUserId: ownerId },
    createdAt: link.createdAt,
  };
};

const sellerStore = (ctx: Ctx) => {
  const user = needUser(ctx);
  const store = storeOfUser(getDB(), user.id);
  if (!store) throw new DemoError(403, "Only sellers can make payment links.");
  return { user, store };
};

export const createLink = (db: DemoDB, store: Row, input: Row, buyerId: string | null = null) => {
  const productId = newId();
  const category = db.categories.find((c) => c.id === input.categoryId) ?? db.categories[0];
  db.products.push({
    id: productId,
    storeId: store.id,
    categoryId: category.id,
    title: String(input.title),
    slug: String(input.title).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    description: String(input.description ?? ""),
    sku: `LINK-${shortCode(8)}`,
    brand: null,
    condition: "NEW",
    deliveryVehicle: input.deliveryVehicle ?? "BIKE",
    status: "PRIVATE",
    isFeatured: false,
    highlights: [],
    price: Number(input.price),
    originalPrice: null,
    stock: Number(input.quantity ?? 1),
    createdAt: now(),
    updatedAt: now(),
    images: ((input.images as Row[]) ?? []).map((img, i) => ({ id: newId(), productId, url: img.url, isPrimary: img.isPrimary ?? i === 0 })),
    specifications: [],
    options: [],
    variations: [],
    views: 0,
    sold: 0,
  });
  const link = { id: newId(), code: shortCode(8), storeId: store.id, productId, deliveryType: input.deliveryType ?? "DELIVERY", deliveryFee: Number(input.deliveryFee ?? 0), isActive: true, isArchived: false, buyerId, createdAt: now(), updatedAt: now() };
  db.paymentLinks.unshift(link);
  return link;
};

route("GET /payment-links/me", (ctx) => {
  const { store } = sellerStore(ctx);
  const db = getDB();
  return ok(db.paymentLinks.filter((l) => l.storeId === store.id && !l.isArchived).map((l) => forSeller(db, l)));
});
route("POST /payment-links", (ctx) => {
  const { store } = sellerStore(ctx);
  const db = getDB();
  const price = Number(ctx.body.price);
  if (store.underReview && price * Number(ctx.body.quantity ?? 1) + Number(ctx.body.deliveryFee ?? 0) > 200000)
    return fail(400, "While your store is new and being reviewed, one order can be up to ₦200,000. Lower the price or quantity - the limit goes once Nestly has reviewed your store (usually within a day).");
  const link = createLink(db, store, ctx.body);
  return created(forSeller(db, link), "Payment link created");
});
route("PATCH /payment-links/:id", (ctx) => {
  const { store } = sellerStore(ctx);
  const db = getDB();
  const link = db.paymentLinks.find((l) => l.id === ctx.params.id && l.storeId === store.id);
  if (!link) return fail(404, "Payment link not found.");
  const p = linkProduct(db, link);
  for (const key of ["title", "description", "price", "categoryId", "deliveryVehicle"]) if (key in ctx.body) p[key] = ctx.body[key];
  if ("quantity" in ctx.body) p.stock = Number(ctx.body.quantity);
  if (ctx.body.images) p.images = (ctx.body.images as Row[]).map((img, i) => ({ id: newId(), productId: p.id, url: img.url, isPrimary: img.isPrimary ?? i === 0 }));
  for (const key of ["deliveryType", "deliveryFee", "isActive"]) if (key in ctx.body) link[key] = ctx.body[key];
  link.updatedAt = now();
  return ok(forSeller(db, link), "Payment link updated");
});
route("DELETE /payment-links/:id", (ctx) => {
  const { store } = sellerStore(ctx);
  const link = getDB().paymentLinks.find((l) => l.id === ctx.params.id && l.storeId === store.id);
  if (link) Object.assign(link, { isArchived: true, isActive: false });
  return ok(null, "Payment link removed");
});

const liveLink = (code: string) => {
  const link = getDB().paymentLinks.find((l) => l.code === code);
  if (!link || link.isArchived) throw new DemoError(404, "This payment link doesn't exist or has been removed.");
  return link;
};
route("GET /payment-links/:code", ({ params, user }) => ok(publicLink(getDB(), liveLink(params.code), user?.id)));

const assertCanBuy = (db: DemoDB, link: Row, userId: string | null, quantity: number) => {
  if (link.buyerId && userId !== link.buyerId) throw new DemoError(403, userId ? "This link is for the buyer the price was agreed with in chat. Make your own offer to the seller." : "This price was agreed in a Nestly chat. Log in to the account that agreed it to pay.");
  if (!link.isActive) throw new DemoError(400, "The seller has paused this link. Message them to turn it back on.");
  const p = linkProduct(db, link);
  if (p.stock <= 0) throw new DemoError(400, "This item has sold out.");
  if (quantity > p.stock) throw new DemoError(400, `Only ${p.stock} left - lower the quantity.`);
};

const linkShipping = (db: DemoDB, link: Row, shippingOptionId?: string) => {
  if (link.deliveryType === "STORE_OPTIONS") {
    const option = db.shippingOptions.find((o) => o.id === shippingOptionId && o.storeId === link.storeId);
    if (!option) throw new DemoError(400, "Choose how you'd like to receive it.");
    return option.id;
  }
  const store = storeById(db, link.storeId)!;
  return link.deliveryType === "PICKUP"
    ? { name: "Pickup", fee: 0, type: "PICKUP", pickupAddress: store.address, eta: null }
    : { name: "Delivery (agreed with seller)", fee: link.deliveryFee, type: "DELIVERY", eta: null };
};

const startLinkOrder = (db: DemoDB, link: Row, user: DemoUser, address: Row, body: Row, guestToken?: string) => {
  const quantity = Number(body.quantity ?? 1);
  const order = createOrder(db, {
    userId: user.id,
    lines: [{ productId: link.productId, quantity }],
    address,
    shipping: { [link.storeId]: linkShipping(db, link, body.shippingOptionId as string | undefined) },
    source: "PAYMENT_LINK",
    paymentLinkId: link.id,
    deliveryPhone: (body.deliveryPhone as string) ?? address.phone,
    note: body.note as string | undefined,
  });
  if (guestToken) order.guestAccessToken = guestToken;
  const pay = startPayment(db, "ORDER", order.total, user.email, { orderIds: [order.id], simulate: true }, order.paymentReference);
  return { orderId: order.id, ...pay, total: order.total, ...(guestToken ? { guestToken } : {}) };
};

route("POST /payment-links/:code/pay", (ctx) => {
  const user = needUser(ctx);
  const db = getDB();
  const link = liveLink(ctx.params.code);
  assertCanBuy(db, link, user.id, Number(ctx.body.quantity ?? 1));
  const address = db.addresses.find((a) => a.id === ctx.body.addressId && a.userId === user.id);
  if (!address) return fail(400, "Add or choose your address first.");
  return ok(startLinkOrder(db, link, user, address, ctx.body), "Payment started");
});

route("POST /payment-links/:code/guest-pay", (ctx) => {
  const db = getDB();
  const link = liveLink(ctx.params.code);
  assertCanBuy(db, link, null, Number(ctx.body.quantity ?? 1));
  const email = String(ctx.body.email ?? "").toLowerCase();
  if (db.users.some((u) => u.email === email && !u.isGuest)) return fail(409, "You already have a Nestly account with this email. Log in to pay.");
  let guest = db.users.find((u) => u.email === email && u.isGuest) as DemoUser | undefined;
  if (!guest) {
    guest = { id: newId(), name: String(ctx.body.name), email, username: `guest_${shortCode(5).toLowerCase()}`, avatar: null, role: "USER", isGuest: true, createdAt: now() };
    db.users.push(guest);
  }
  const address = { id: newId(), userId: guest.id, fullName: guest.name, phone: String(ctx.body.phone), address: String(ctx.body.address ?? ""), city: String(ctx.body.city ?? ""), state: String(ctx.body.state ?? ""), country: "Nigeria", isDefault: true, createdAt: now() };
  db.addresses.push(address);
  return ok(startLinkOrder(db, link, guest, address, ctx.body, shortCode(32)), "Payment started");
});

const guestOrder = (token: string) => {
  const db = getDB();
  const order = db.orders.find((o) => o.guestAccessToken === token);
  if (!order) throw new DemoError(404, "Order not found.");
  const store = storeById(db, order.shipping[0]?.storeId);
  const buyer = userById(db, order.userId)!;
  const { guestAccessToken, ...view } = orderView(db, order);
  void guestAccessToken;
  return {
    ...view,
    store: store ? { name: store.name, slug: store.slug, logo: store.logo, isVerified: store.isVerified, sellerUserId: storeOwnerId(db, store) } : null,
    paymentLinkCode: db.paymentLinks.find((l) => l.id === order.paymentLinkId)?.code ?? null,
    buyer: { name: buyer.name, email: buyer.email.replace(/^(.).*(.@.*)$/, "$1***$2"), isGuest: !!buyer.isGuest },
  };
};
route("GET /payment-links/guest-orders/:token", ({ params }) => ok(guestOrder(params.token)));
route("POST /payment-links/guest-orders/:token/verify", ({ params }) => ok(guestOrder(params.token)));

// ---------- group gifts (chip in) ----------
const groupGiftView = (db: DemoDB, g: Row, viewerId?: string) => {
  const p = productById(db, g.productId)!;
  const store = storeById(db, g.storeId)!;
  const paid = g.contributions.filter((c: Row) => c.status === "PAID");
  const raised = paid.reduce((a: number, c: Row) => a + c.amount - c.refundedAmount, 0);
  const mine = paid.filter((c: Row) => c.userId === viewerId);
  return {
    code: g.code,
    status: g.status,
    recipientName: g.recipientName,
    recipient: miniUser(userById(db, g.recipientId)),
    organizer: miniUser(userById(db, g.organizerId)),
    message: g.message,
    product: { id: p.id, title: p.title, image: p.images[0]?.url ?? null },
    store: { name: store.name, slug: store.slug, isVerified: store.isVerified },
    target: g.target,
    raised,
    remaining: Math.max(0, g.target - raised),
    deadline: g.deadline,
    closedAt: g.closedAt,
    minContribution: 500,
    contributors: paid.map((c: Row) => {
      const u = userById(db, c.userId);
      return { name: c.hideName ? null : u?.name ?? null, avatar: c.hideName ? null : u?.avatar ?? null, message: c.message, at: c.paidAt };
    }),
    myContribution: mine.length ? mine.reduce((a: number, c: Row) => a + c.amount - c.refundedAmount, 0) : null,
    isOrganizer: viewerId === g.organizerId,
    giftCode: viewerId === g.organizerId ? db.gifts.find((x) => x.id === g.giftId)?.code ?? null : null,
    createdAt: g.createdAt,
    surprise: false,
  };
};
const findGroupGift = (code: string) => {
  const g = getDB().groupGifts.find((x) => x.code === code);
  if (!g) throw new DemoError(404, "This group gift doesn't exist.");
  return g;
};

whenPaid("CONTRIBUTION", (db, payment) => {
  const g = db.groupGifts.find((x) => x.id === payment.data.groupGiftId);
  const c = g?.contributions.find((x: Row) => x.paymentReference === payment.reference);
  if (!g || !c || c.status === "PAID") return;
  c.status = "PAID";
  c.paidAt = now();
  const raised = g.contributions.filter((x: Row) => x.status === "PAID").reduce((a: number, x: Row) => a + x.amount - x.refundedAmount, 0);
  const contributor = userById(db, c.userId);
  if (g.organizerId !== c.userId) notify(db, g.organizerId, "Someone chipped in 🎁", `${c.hideName ? "Someone" : contributor?.name} chipped in ${naira(c.amount)} for ${g.recipientName}'s gift.`, { type: "GROUP_GIFT", id: g.code });
  if (raised >= g.target && g.status === "OPEN") fundGroupGift(db, g);
});

// Funded: the gift order is placed and paid in full by the contributions.
const fundGroupGift = (db: DemoDB, g: Row) => {
  g.status = "FUNDED";
  g.closedAt = now();
  const order = createOrder(db, { userId: g.organizerId, lines: [{ productId: g.productId, quantity: 1, unitPrice: g.unitPrice }], address: null, shipping: { [g.storeId]: g.shippingOptionId }, source: "GROUP_GIFT" });
  markPaid(db, order);
  planOrder(order);
  const gift = { id: newId(), code: shortCode(10), orderId: order.id, senderId: g.organizerId, recipientId: g.recipientId, recipientName: g.recipientName, message: g.message, status: "SENT", createdAt: now(), expiresAt: inDays(7) };
  db.gifts.push(gift);
  g.giftId = gift.id;
  for (const userId of new Set<string>(g.contributions.filter((c: Row) => c.status === "PAID").map((c: Row) => c.userId)))
    notify(db, userId, "The gift is on its way! 🎉", `You and your friends covered ${g.recipientName}'s gift. ${storeById(db, g.storeId)?.name} is preparing it.`, { type: "GROUP_GIFT", id: g.code });
  if (g.recipientId) notify(db, g.recipientId, "You've got a gift 🎁", `Your friends sent you a gift on Nestly. Open it to choose where it's delivered.`, { type: "GIFT", id: gift.code });
};

route("GET /group-gifts/:code", ({ params, user }) => {
  const db = getDB();
  const g = findGroupGift(params.code);
  if (user && user.id === g.recipientId && g.status === "OPEN") return ok({ code: g.code, status: g.status, surprise: true, recipientName: g.recipientName });
  return ok(groupGiftView(db, g, user?.id));
});

route("POST /group-gifts", (ctx) => {
  const user = needUser(ctx);
  const db = getDB();
  const p = productById(db, ctx.body.productId as string);
  const option = db.shippingOptions.find((o) => o.id === ctx.body.shippingOptionId);
  if (!p || !option) return fail(400, "Choose the gift and how it gets to them.");
  const code = shortCode(9);
  const g = {
    id: newId(),
    code,
    organizerId: user.id,
    recipientId: (ctx.body.recipientId as string) ?? null,
    recipientName: String(ctx.body.recipientName ?? "a friend"),
    message: (ctx.body.message as string) ?? null,
    storeId: p.storeId,
    productId: p.id,
    variationId: null,
    shippingOptionId: option.id,
    unitPrice: p.price,
    deliveryFee: option.fee,
    target: p.price + option.fee,
    deadline: (ctx.body.deadline as string) ?? inDays(3),
    status: "OPEN",
    closedAt: null,
    giftId: null,
    createdAt: now(),
    contributions: [] as Row[],
  };
  db.groupGifts.unshift(g);
  return created(groupGiftView(db, g, user.id), "Group gift started");
});

route("POST /group-gifts/:code/contribute", (ctx) => {
  const user = needUser(ctx);
  const db = getDB();
  const g = findGroupGift(ctx.params.code);
  if (g.status !== "OPEN") return fail(400, "This group gift has closed.");
  if (user.id === g.recipientId) return fail(400, "This gift is for you - no chipping in on your own surprise!");
  const raised = g.contributions.filter((c: Row) => c.status === "PAID").reduce((a: number, c: Row) => a + c.amount, 0);
  const remaining = g.target - raised;
  const amount = Number(ctx.body.amount);
  if (amount > remaining) return fail(400, `Only ${naira(remaining)} is left - chip in up to that.`);
  if (amount < Math.min(500, remaining)) return fail(400, `The smallest contribution is ${naira(Math.min(500, remaining))}.`);
  const reference = `NESTLY_CHIPIN_${newId().slice(-20)}`;
  g.contributions.push({ id: newId(), userId: user.id, amount, message: (ctx.body.message as string) ?? null, hideName: !!ctx.body.hideName, status: "PENDING", refundedAmount: 0, paidAt: null, paymentReference: reference });
  const pay = startPayment(db, "CONTRIBUTION", amount, user.email, { groupGiftId: g.id }, reference);
  return ok({ ...pay, amount }, "Payment started");
});

route("POST /group-gifts/contributions/:reference/verify", (ctx) => {
  needUser(ctx);
  const payment = paymentByReference(ctx.params.reference);
  if (!payment || payment.status !== "SUCCESS") return fail(400, "Payment was not successful.");
  const g = getDB().groupGifts.find((x) => x.id === payment.data.groupGiftId)!;
  return ok(groupGiftView(getDB(), g, ctx.user?.id));
});

route("POST /group-gifts/:code/cancel", (ctx) => {
  const user = needUser(ctx);
  const db = getDB();
  const g = findGroupGift(ctx.params.code);
  if (g.organizerId !== user.id) return fail(403, "Only the person who started it can call it off.");
  if (g.status !== "OPEN") return fail(400, "This group gift has closed.");
  g.status = "CANCELLED";
  g.closedAt = now();
  for (const c of g.contributions.filter((x: Row) => x.status === "PAID")) {
    c.status = "REFUNDED";
    c.refundedAmount = c.amount;
    notify(db, c.userId, "Group gift called off", `The group gift for ${g.recipientName} was called off. Your ${naira(c.amount)} is being refunded.`, { type: "GROUP_GIFT", id: g.code });
  }
  return ok(groupGiftView(db, g, user.id), "Group gift called off");
});

route("GET /gifts", (ctx) => {
  const user = needUser(ctx);
  const db = getDB();
  const box = ctx.query.box;
  const gifts = db.gifts
    .filter((g) => (box === "sent" ? g.senderId === user.id : box === "received" ? g.recipientId === user.id : g.senderId === user.id || g.recipientId === user.id))
    .map((g) => {
      const order = db.orders.find((o) => o.id === g.orderId);
      const item = order?.items[0];
      return { ...g, role: g.senderId === user.id ? "SENDER" : "RECIPIENT", canClaim: g.recipientId === user.id && g.status === "SENT", sender: miniUser(userById(db, g.senderId)), product: item ? { title: item.productTitle, image: item.productImage } : null, store: order ? { name: storeById(db, order.shipping[0].storeId)?.name } : null };
    });
  return ok({ gifts, total: gifts.length, page: 1, limit: 20, totalPages: 1 });
});

// ---------- banks & locations ----------
route("GET /payment-methods/banks", () =>
  ok(["Access Bank", "First Bank", "GTBank", "Kuda", "Moniepoint", "OPay", "PalmPay", "UBA", "Zenith Bank", "Wema Bank"].map((name, i) => ({ id: i + 1, name, code: String(44 + i * 7).padStart(3, "0"), slug: name.toLowerCase().replace(/\s+/g, "-") })))
);
route("POST /payment-methods/resolve", (ctx) => ok({ accountName: (needUser(ctx).name as string).toUpperCase(), accountNumber: ctx.body.accountNumber, bankCode: ctx.body.bankCode }));

const STATES = ["Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Federal Capital Territory", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"];
route("GET /locations/states", () => ok(STATES.map((name) => ({ name, lgaCount: name === "Lagos" ? 20 : 12, hasSuggestedZones: name === "Lagos" || name === "Federal Capital Territory" }))));
route("GET /locations/search", ({ query }) => {
  const q = String(query.q ?? "").toLowerCase();
  const db = getDB();
  const places = new Map<string, Row>();
  db.stores.forEach((s) => places.set(`${s.city}|${s.state}`, { area: s.city, city: s.city, state: s.state, label: `${s.city}, ${s.state}` }));
  db.shippingOptions.forEach((o) => o.areas.forEach((a: string) => places.set(`${a}|${o.state}`, { area: a, city: a, state: o.state, label: `${a}, ${o.state}` })));
  return ok([...places.values()].filter((p) => p.label.toLowerCase().includes(q)).slice(0, 8).map((p) => ({ ...p, storeCount: db.stores.filter((s) => s.state === p.state).length })));
});

const LAGOS_ZONES = [
  { name: "Lekki / Ajah", areas: ["Lekki", "Ajah", "Sangotedo", "Chevron"] },
  { name: "Victoria Island / Ikoyi", areas: ["Victoria Island", "Ikoyi", "Obalende"] },
  { name: "Ikeja / Maryland", areas: ["Ikeja", "Maryland", "Ogba", "Allen"] },
  { name: "Yaba / Surulere", areas: ["Yaba", "Surulere", "Ebute Metta"] },
  { name: "Festac / Amuwo", areas: ["Festac", "Amuwo Odofin", "Mile 2", "Ojo"] },
];
route("GET /locations/states/:state", ({ params }) => {
  const lagos = params.state === "Lagos";
  const lgas = lagos ? ["Alimosho", "Eti-Osa", "Ikeja", "Kosofe", "Lagos Island", "Lagos Mainland", "Surulere", "Amuwo-Odofin", "Ikorodu", "Oshodi-Isolo"] : [`${params.state} Central`, `${params.state} North`, `${params.state} South`];
  const areas = [...new Set([...lgas, ...(lagos ? LAGOS_ZONES.flatMap((z) => z.areas) : [])])].sort();
  return ok({ state: params.state, lgas, areas, suggestedZones: lagos ? LAGOS_ZONES : [] });
});

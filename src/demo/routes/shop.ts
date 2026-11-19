// Buyer side: cart, wishlist, orders, the shopping feed and Near me.

import { getDB, type Row } from "../db";
import { isListed, miniUser, orderView, productById, productCard, productDetail, storeById, userById } from "../model";
import { created, fail, needUser, ok, paginate, route } from "../router";
import { newId, now } from "../util";

// ---- cart ----
const cartOf = (userId: string) => {
  const db = getDB();
  let cart = db.carts.find((c) => c.userId === userId);
  if (!cart) {
    cart = { id: newId(), userId, items: [] };
    db.carts.push(cart);
  }
  return cart;
};
const cartView = (userId: string) => {
  const db = getDB();
  const cart = cartOf(userId);
  const items = cart.items
    .map((i: Row) => {
      const p = productById(db, i.productId);
      return p ? { ...i, product: productDetail(db, p, userId), unitPrice: p.price, variation: null, variantLabel: null } : null;
    })
    .filter(Boolean);
  return { id: cart.id, items, subtotal: items.reduce((a: number, i: Row) => a + i.unitPrice * i.quantity, 0), itemCount: items.reduce((a: number, i: Row) => a + i.quantity, 0) };
};
route("GET /cart", (ctx) => ok(cartView(needUser(ctx).id)));
route("POST /cart", (ctx) => {
  const user = needUser(ctx);
  const db = getDB();
  const p = productById(db, ctx.body.productId as string);
  if (!p || !isListed(db, p)) return fail(404, "That product isn't available.");
  const cart = cartOf(user.id);
  const existing = cart.items.find((i: Row) => i.productId === p.id);
  const quantity = (existing?.quantity ?? 0) + Number(ctx.body.quantity ?? 1);
  if (quantity > p.stock) return fail(400, `Only ${p.stock} left in stock.`);
  if (existing) existing.quantity = quantity;
  else cart.items.push({ id: newId(), productId: p.id, variationId: null, quantity });
  return created(cartView(user.id).items.find((i: Row) => i.productId === p.id), "Added to cart");
});
route("PATCH /cart/:itemId", (ctx) => {
  const user = needUser(ctx);
  const cart = cartOf(user.id);
  const item = cart.items.find((i: Row) => i.id === ctx.params.itemId);
  if (!item) return fail(404, "Item not found.");
  const p = productById(getDB(), item.productId);
  const quantity = Number(ctx.body.quantity);
  if (p && quantity > p.stock) return fail(400, `Only ${p.stock} left in stock.`);
  item.quantity = Math.max(1, quantity);
  return ok(cartView(user.id).items.find((i: Row) => i.id === item.id));
});
route("DELETE /cart/:itemId", (ctx) => {
  const cart = cartOf(needUser(ctx).id);
  cart.items = cart.items.filter((i: Row) => i.id !== ctx.params.itemId);
  return ok(null, "Removed");
});
route("DELETE /cart", (ctx) => {
  cartOf(needUser(ctx).id).items = [];
  return ok(null, "Cart cleared");
});

// ---- wishlist ----
const wishlistItems = (userId: string) => {
  const db = getDB();
  return db.wishlist
    .filter((w) => w.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((w) => {
      const p = productById(db, w.productId);
      return p ? { id: `${w.userId}_${w.productId}`, productId: p.id, createdAt: w.createdAt, product: productCard(db, p) } : null;
    })
    .filter(Boolean) as Row[];
};
route("GET /wishlist", (ctx) => {
  const user = needUser(ctx);
  return ok(paginate(wishlistItems(user.id), ctx.query, "items", { visibility: user.wishlistVisibility ?? "FOLLOWERS" }));
});
route("POST /wishlist", (ctx) => {
  const user = needUser(ctx);
  const db = getDB();
  const productId = ctx.body.productId as string;
  if (!db.wishlist.some((w) => w.userId === user.id && w.productId === productId)) db.wishlist.push({ userId: user.id, productId, createdAt: now() });
  return created(wishlistItems(user.id).find((w) => w.productId === productId), "Saved to your wishlist");
});
route("DELETE /wishlist/:productId", (ctx) => {
  const user = needUser(ctx);
  const db = getDB();
  db.wishlist = db.wishlist.filter((w) => !(w.userId === user.id && w.productId === ctx.params.productId));
  return ok(null, "Removed from your wishlist");
});
route("PATCH /wishlist/visibility", (ctx) => {
  const user = needUser(ctx);
  user.wishlistVisibility = ctx.body.visibility;
  return ok({ wishlistVisibility: user.wishlistVisibility });
});
route("GET /users/:id/wishlist", ({ params, query }) => {
  const db = getDB();
  const owner = db.users.find((u) => u.id === params.id || u.username === params.id);
  if (!owner) return fail(404, "User not found.");
  return ok(paginate(wishlistItems(owner.id), query, "items", { user: miniUser(owner), visibility: owner.wishlistVisibility ?? "FOLLOWERS", canView: true }));
});

// ---- orders (buyer) ----
route("GET /orders", (ctx) => {
  const user = needUser(ctx);
  const db = getDB();
  let mine = db.orders.filter((o) => o.userId === user.id && o.status !== "PENDING").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (ctx.query.status) mine = mine.filter((o) => o.status === ctx.query.status);
  return ok(paginate(mine.map((o) => orderView(db, o)), ctx.query, "orders"));
});
route("GET /orders/:id", (ctx) => {
  const user = needUser(ctx);
  const db = getDB();
  const order = db.orders.find((o) => o.id === ctx.params.id && o.userId === user.id);
  return order ? ok(orderView(db, order)) : fail(404, "Order not found.");
});

// ---- the shopping feed ----
const feedProduct = (p: Row) => {
  const db = getDB();
  const s = storeById(db, p.storeId)!;
  return { id: p.id, title: p.title, price: p.price, image: p.images[0]?.url ?? null, store: { name: s.name, slug: s.slug, logo: s.logo, isVerified: s.isVerified } };
};

const storesNear = (state: string, area: string | null) => {
  const db = getDB();
  return new Set(
    db.stores
      .filter((s) => {
        if (s.isSuspended) return false;
        if (!area) return s.state === state;
        if (s.city.toLowerCase() === area.toLowerCase()) return true;
        return db.shippingOptions.some((o) => o.storeId === s.id && o.type === "DELIVERY" && o.areas.some((a: string) => a.toLowerCase() === area.toLowerCase()));
      })
      .map((s) => s.id)
  );
};

const areaFor = (userId: string) => {
  const db = getDB();
  const chosen = db.feedAreas.find((a) => a.userId === userId);
  if (chosen) return { ...chosen, source: "CHOSEN" };
  const address = db.addresses.find((a) => a.userId === userId && a.isDefault);
  return address ? { state: address.state, area: address.city, source: "ADDRESS" } : null;
};

route("GET /feed", (ctx) => {
  const user = needUser(ctx);
  const db = getDB();
  const near = ctx.query.near === "true";
  const area = near ? areaFor(user.id) : null;
  if (near && !area) return ok({ items: [], nextBefore: null, highlights: { live: [], birthdays: [], groupGifts: [] }, area: null, nearCount: 0 });
  const nearStores = area ? storesNear(area.state, area.area) : null;
  const followedStores = new Set(db.follows.filter((f) => f.followerId === user.id && f.storeId).map((f) => f.storeId));
  const followedPeople = new Set(db.follows.filter((f) => f.followerId === user.id && f.userId).map((f) => f.userId));
  const reasonFor = (storeId: string | null, personId?: string | null) =>
    near ? "NEAR" : (storeId && followedStores.has(storeId)) || (personId && followedPeople.has(personId)) ? "FOLLOWING" : "POPULAR";
  const inScope = (storeId: string | null) => !nearStores || (storeId !== null && nearStores.has(storeId));

  const purchases = db.reviews
    .filter((r) => r.comment)
    .map((r) => ({ r, p: productById(db, r.productId)! }))
    .filter(({ p }) => p && isListed(db, p) && inScope(p.storeId))
    .sort((a, b) => b.r.createdAt.localeCompare(a.r.createdAt))
    .slice(0, 12)
    .map(({ r, p }) => ({
      type: "PURCHASE",
      id: `purchase-${r.id}`,
      at: r.createdAt,
      reason: reasonFor(p.storeId, r.userId),
      buyer: miniUser(userById(db, r.userId)),
      rating: r.rating,
      comment: r.comment,
      images: r.images,
      product: feedProduct(p),
    }));

  // New items grouped per store per day.
  const drops: Row[] = [];
  const recent = db.products.filter((p) => isListed(db, p) && inScope(p.storeId) && Date.now() - new Date(p.createdAt).getTime() < 21 * 86400000);
  const groups = new Map<string, Row[]>();
  recent.forEach((p) => {
    const key = `${p.storeId}:${p.createdAt.slice(0, 10)}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  });
  groups.forEach((products, key) => {
    const s = storeById(db, products[0].storeId)!;
    drops.push({
      type: "DROP",
      id: `drop-${key}`,
      at: products.map((p) => p.createdAt).sort().pop(),
      reason: reasonFor(s.id),
      store: { name: s.name, slug: s.slug, logo: s.logo, isVerified: s.isVerified },
      products: products.slice(0, 4).map(feedProduct),
      total: products.length,
    });
  });

  const posts = db.posts
    .filter((p) => !p.isDeleted)
    .filter((p) => {
      const store = db.stores.find((s) => db.sellers.find((x) => x.id === s.sellerId)?.userId === p.authorId);
      return !nearStores || (store && nearStores.has(store.id));
    })
    .map((p) => {
      const product = p.productId ? productById(db, p.productId) : null;
      const author = userById(db, p.authorId);
      return {
        type: "POST",
        id: `post-${p.id}`,
        at: p.createdAt,
        reason: reasonFor(null, p.authorId),
        tagged: !!product,
        post: {
          ...p,
          author: miniUser(author),
          likeCount: p.likes.length,
          likedByMe: p.likes.includes(user.id),
          commentCount: p.comments.length,
          product: product ? { id: product.id, title: product.title, price: product.price, image: product.images[0]?.url, store: { name: storeById(db, product.storeId)!.name, slug: storeById(db, product.storeId)!.slug } } : null,
        },
      };
    });

  const items = [...purchases, ...drops, ...posts].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, Number(ctx.query.limit) || 20);

  const live = db.lives
    .filter((l) => l.status === "LIVE" && inScope(l.storeId))
    .map((l) => {
      const s = storeById(db, l.storeId)!;
      return { code: l.code, title: l.title, coverImage: productById(db, l.productIds[0])?.images[0]?.url ?? null, startedAt: l.startedAt, store: { name: s.name, slug: s.slug, logo: s.logo } };
    });
  const birthdays = db.users
    .filter((u) => followedPeople.has(u.id) && u.dateOfBirth)
    .map((u) => {
      const today = new Date();
      const dob = new Date(u.dateOfBirth);
      const next = new Date(today.getFullYear(), dob.getUTCMonth(), dob.getUTCDate());
      if (next < new Date(today.getFullYear(), today.getMonth(), today.getDate())) next.setFullYear(today.getFullYear() + 1);
      return { ...miniUser(u)!, inDays: Math.round((next.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000) };
    })
    .filter((b) => b.inDays <= 14)
    .sort((a, b) => a.inDays - b.inDays);
  // Tolu's birthday is the story the demo tells, so it's always coming up.
  const tolu = userById(db, "u_tolu");
  if (tolu && followedPeople.has("u_tolu") && !birthdays.some((b) => b.id === "u_tolu")) birthdays.unshift({ ...miniUser(tolu)!, inDays: 2 });
  const groupGifts = db.groupGifts
    .filter((g) => g.status === "OPEN")
    .map((g) => {
      const p = productById(db, g.productId)!;
      const organizer = userById(db, g.organizerId)!;
      return {
        code: g.code,
        recipientName: g.recipientName,
        organizer: { name: organizer.name, avatar: organizer.avatar },
        product: { title: p.title, image: p.images[0]?.url ?? null },
        target: g.target,
        raised: g.contributions.filter((c: Row) => c.status === "PAID").reduce((a: number, c: Row) => a + c.amount - c.refundedAmount, 0),
        deadline: g.deadline,
      };
    });

  return ok({ items, nextBefore: null, highlights: { live, birthdays, groupGifts }, ...(near ? { area, nearCount: nearStores?.size ?? 0 } : {}) });
});

route("GET /feed/area", (ctx) => {
  const user = needUser(ctx);
  const area = areaFor(user.id);
  if (!area) return ok(null);
  return ok({ state: area.state, area: area.area ?? null, label: [area.area, area.state].filter(Boolean).join(", "), source: area.source, storeCount: storesNear(area.state, area.area ?? null).size });
});
route("PUT /feed/area", (ctx) => {
  const user = needUser(ctx);
  const db = getDB();
  db.feedAreas = db.feedAreas.filter((a) => a.userId !== user.id);
  const row = { userId: user.id, state: String(ctx.body.state), area: (ctx.body.area as string | null) ?? null };
  db.feedAreas.push(row);
  return ok({ ...row, label: [row.area, row.state].filter(Boolean).join(", "), source: "CHOSEN", storeCount: storesNear(row.state, row.area).size }, "Area saved");
});
route("GET /feed/area/options", ({ query }) => {
  const db = getDB();
  const state = query.state ?? "Lagos";
  const areas = new Set<string>();
  db.shippingOptions.filter((o) => o.state === state).forEach((o) => o.areas.forEach((a: string) => areas.add(a)));
  db.stores.filter((s) => s.state === state).forEach((s) => areas.add(s.city));
  const options = [...areas].sort().map((name) => ({ name, storeCount: storesNear(state, name).size }));
  return ok({ state, areas: options.map((o) => o.name), options });
});

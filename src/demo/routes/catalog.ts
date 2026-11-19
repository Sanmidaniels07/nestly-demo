// Browsing: categories, products, stores, trust records, reviews, search.

import { getDB, type Row } from "../db";
import { isListed, miniUser, productCard, productDetail, storeById, storeView, trustRecord, userById } from "../model";
import { DemoError, fail, ok, paginate, route } from "../router";

const listed = () => {
  const db = getDB();
  return db.products.filter((p) => isListed(db, p));
};

const sortProducts = (items: Row[], sort?: string) => {
  const copy = [...items];
  if (sort === "price_asc") copy.sort((a, b) => a.price - b.price);
  else if (sort === "price_desc") copy.sort((a, b) => b.price - a.price);
  else if (sort === "oldest") copy.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  else copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return copy;
};

const matches = (p: Row, q: string) => {
  const db = getDB();
  const text = `${p.title} ${p.description} ${storeById(db, p.storeId)?.name ?? ""}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
};

const categoryOf = (slugOrId?: string) => {
  if (!slugOrId) return null;
  return getDB().categories.find((c) => c.slug === slugOrId || c.id === slugOrId) ?? null;
};

// ---- categories ----
const categoriesWithCounts = () => {
  const db = getDB();
  return db.categories.map((c): Row => ({ ...c, _count: { products: listed().filter((p) => p.categoryId === c.id).length } }));
};
route("GET /categories", () => ok(categoriesWithCounts()));
route("GET /categories/featured", ({ query }) => ok(categoriesWithCounts().filter((c) => c.isFeatured).slice(0, Number(query.limit) || 12)));
route("GET /categories/popular", ({ query }) =>
  ok([...categoriesWithCounts()].sort((a, b) => b._count.products - a._count.products).slice(0, Number(query.limit) || 8))
);
route("GET /categories/:slug", ({ params }) => {
  const c = categoryOf(params.slug);
  return c ? ok(c) : fail(404, "Category not found.");
});

// ---- products ----
route("GET /products", ({ query }) => {
  const db = getDB();
  let items = listed();
  const category = categoryOf(query.category);
  if (category) items = items.filter((p) => p.categoryId === category.id);
  if (query.search) items = items.filter((p) => matches(p, query.search));
  if (query.storeId) items = items.filter((p) => p.storeId === query.storeId);
  if (query.minPrice) items = items.filter((p) => p.price >= Number(query.minPrice));
  if (query.maxPrice) items = items.filter((p) => p.price <= Number(query.maxPrice));
  return ok(paginate(sortProducts(items, query.sort).map((p) => productCard(db, p)), query, "products"));
});

route("GET /products/featured", ({ query }) => {
  const db = getDB();
  return ok(listed().filter((p) => p.isFeatured).slice(0, Number(query.limit) || 8).map((p) => productCard(db, p)));
});

// Near a place: based there, or delivering there, then the rest of the city/state.
route("GET /products/nearby", ({ query }) => {
  const db = getDB();
  const state = query.state ?? "Lagos";
  const area = (query.area ?? query.city ?? "").toLowerCase();
  const tierOf = (p: Row) => {
    const store = storeById(db, p.storeId)!;
    const zones = db.shippingOptions.filter((o) => o.storeId === store.id && o.type === "DELIVERY" && !o.isArchived);
    if (area && store.city.toLowerCase() === area) return { tier: "AREA", deliveryFee: Math.min(...zones.map((z) => z.fee), 0) };
    const zone = zones.find((z) => z.areas.some((a: string) => a.toLowerCase() === area));
    if (zone) return { tier: "DELIVERS", deliveryFee: zone.fee };
    if (store.state === state) return { tier: area ? "CITY" : "STATE", deliveryFee: zones.find((z) => z.state === state)?.fee ?? null };
    return null;
  };
  let items = listed()
    .map((p) => ({ p, nearby: tierOf(p) }))
    .filter((x) => x.nearby);
  const category = categoryOf(query.category);
  if (category) items = items.filter((x) => x.p.categoryId === category.id);
  const order = ["AREA", "DELIVERS", "CITY", "STATE"];
  items.sort((a, b) => order.indexOf(a.nearby!.tier) - order.indexOf(b.nearby!.tier));
  const tierCounts: Record<string, number> = {};
  items.forEach((x) => (tierCounts[x.nearby!.tier] = (tierCounts[x.nearby!.tier] ?? 0) + 1));
  const label = [query.area ?? query.city, state].filter(Boolean).join(", ");
  return ok(
    paginate(
      items.map((x) => ({ ...productCard(db, x.p), nearby: x.nearby })),
      query,
      "products",
      { location: { state, city: query.city ?? null, area: query.area ?? null, label }, tierCounts }
    )
  );
});

route("GET /products/:id", ({ params, user }) => {
  const db = getDB();
  const p = db.products.find((x) => x.id === params.id || x.slug === params.id);
  if (!p || (p.status !== "PUBLISHED" && p.status !== "OUT_OF_STOCK" && storeById(db, p.storeId)?.sellerId !== db.sellers.find((s) => s.userId === user?.id)?.id))
    return fail(404, "Product not found.");
  return ok(productDetail(db, p, user?.id));
});

route("GET /products/:id/related", ({ params, query }) => {
  const db = getDB();
  const p = db.products.find((x) => x.id === params.id);
  if (!p) return ok([]);
  const related = listed().filter((x) => x.id !== p.id && (x.categoryId === p.categoryId || x.storeId === p.storeId));
  return ok(related.slice(0, Number(query.limit) || 8).map((x) => productCard(db, x)));
});

const reviewView = (r: Row) => {
  const db = getDB();
  const p = db.products.find((x) => x.id === r.productId);
  return { ...r, storeId: p?.storeId, productTitle: p?.title, user: miniUser(userById(db, r.userId)), earlierVersion: false };
};

const summary = (reviews: Row[]) => ({
  averageRating: reviews.length ? Math.round((reviews.reduce((a, r) => a + r.rating, 0) / reviews.length) * 10) / 10 : 0,
  ratingCount: reviews.length,
  earlierVersionCount: 0,
  distribution: [5, 4, 3, 2, 1].map((stars) => ({ rating: stars, count: reviews.filter((r) => r.rating === stars).length })),
});

route("GET /products/:id/reviews", ({ params, query }) => {
  const db = getDB();
  const reviews = db.reviews.filter((r) => r.productId === params.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return ok(paginate(reviews.map(reviewView), query, "reviews", { summary: summary(reviews), ...summary(reviews) }));
});

// ---- stores ----
const storeBySlug = (slug: string) => {
  const db = getDB();
  const s = db.stores.find((x) => x.slug === slug || x.id === slug);
  if (!s) throw new DemoError(404, "Store not found.");
  return s;
};

route("GET /stores", ({ query, user }) => {
  const db = getDB();
  let items = db.stores.filter((s) => !s.isSuspended);
  if (query.search) items = items.filter((s) => s.name.toLowerCase().includes(query.search.toLowerCase()));
  return ok(paginate(items.map((s) => storeView(db, s, user?.id)), query, "stores"));
});

route("GET /stores/:slug", ({ params, user }) => {
  const db = getDB();
  const s = storeBySlug(params.slug);
  if (s.isSuspended && user?.role !== "ADMIN") return fail(404, "Store not found.");
  return ok(storeView(db, s, user?.id));
});

route("GET /stores/:slug/trust", ({ params }) => {
  const s = storeBySlug(params.slug);
  if (s.isSuspended) return fail(404, "Store not found.");
  return ok(trustRecord(getDB(), s));
});

route("GET /stores/:slug/products", ({ params, query }) => {
  const db = getDB();
  const s = storeBySlug(params.slug);
  const items = sortProducts(listed().filter((p) => p.storeId === s.id), query.sort);
  return ok(paginate(items.map((p) => productCard(db, p)), query, "products"));
});

route("GET /stores/:slug/reviews", ({ params, query }) => {
  const db = getDB();
  const s = storeBySlug(params.slug);
  const reviews = db.reviews.filter((r) => db.products.find((p) => p.id === r.productId)?.storeId === s.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return ok(paginate(reviews.map(reviewView), query, "reviews", { summary: summary(reviews), ...summary(reviews) }));
});

route("GET /stores/:slug/follow/status", ({ params, user }) => {
  const s = storeBySlug(params.slug);
  return ok({ isFollowing: !!user && getDB().follows.some((f) => f.followerId === user.id && f.storeId === s.id) });
});

route("POST /stores/:slug/follow", ({ params, user }) => {
  if (!user) return fail(401, "Please log in to continue.");
  const db = getDB();
  const s = storeBySlug(params.slug);
  if (!db.follows.some((f) => f.followerId === user.id && f.storeId === s.id)) db.follows.push({ followerId: user.id, storeId: s.id, createdAt: new Date().toISOString() });
  return ok({ id: s.id, isFollowing: true }, "Following");
});

route("DELETE /stores/:slug/follow", ({ params, user }) => {
  if (!user) return fail(401, "Please log in to continue.");
  const db = getDB();
  const s = storeBySlug(params.slug);
  db.follows = db.follows.filter((f) => !(f.followerId === user.id && f.storeId === s.id));
  return ok(null, "Unfollowed");
});

// ---- recommendations ----
const ranked = (score: (p: Row) => number, limit: number, category?: string) => {
  const db = getDB();
  let items = listed();
  const c = categoryOf(category);
  if (c) items = items.filter((p) => p.categoryId === c.id);
  return [...items].sort((a, b) => score(b) - score(a)).slice(0, limit).map((p) => productCard(db, p));
};
route("GET /recommendations/trending", ({ query }) => ok(ranked((p) => p.views + p.sold * 8, Number(query.limit) || 10, query.category)));
route("GET /recommendations/best-sellers", ({ query }) => ok(ranked((p) => p.sold, Number(query.limit) || 10, query.category)));
route("GET /recommendations/for-you", ({ query, user }) => {
  const db = getDB();
  const followed = new Set(db.follows.filter((f) => f.followerId === user?.id && f.storeId).map((f) => f.storeId));
  return ok(ranked((p) => (followed.has(p.storeId) ? 1000 : 0) + p.views, Number(query.limit) || 10));
});
route("GET /recommendations/recently-viewed", ({ query, user }) => {
  const db = getDB();
  const seen = (user?.recentlyViewed ?? []) as string[];
  return ok(seen.map((id) => db.products.find((p) => p.id === id)).filter(Boolean).slice(0, Number(query.limit) || 10).map((p) => productCard(db, p!)));
});
route("POST /recommendations/views", ({ body, user }) => {
  if (user) user.recentlyViewed = [body.productId as string, ...((user.recentlyViewed ?? []) as string[]).filter((id) => id !== body.productId)].slice(0, 20);
  const p = getDB().products.find((x) => x.id === body.productId);
  if (p) p.views += 1;
  return ok(null);
});

// ---- search ----
route("GET /search", ({ query }) => {
  const db = getDB();
  const q = (query.q ?? "").toLowerCase().trim();
  if (!q) return ok({ users: [], stores: [], products: [], posts: [], communities: [], hashtags: [] });
  return ok({
    users: db.users.filter((u) => u.role !== "ADMIN" && (u.name.toLowerCase().includes(q) || u.username.includes(q))).slice(0, 5).map(miniUser),
    stores: db.stores.filter((s) => !s.isSuspended && s.name.toLowerCase().includes(q)).slice(0, 5).map((s) => ({ id: s.id, name: s.name, slug: s.slug, logo: s.logo, isVerified: s.isVerified })),
    products: listed().filter((p) => matches(p, q)).slice(0, 6).map((p) => productCard(db, p)),
    posts: [],
    communities: [],
    hashtags: [],
  });
});
route("GET /search/:type", ({ params, query }) => {
  const db = getDB();
  const q = (query.q ?? "").toLowerCase();
  if (params.type === "products") return ok(paginate(listed().filter((p) => matches(p, q)).map((p) => productCard(db, p)), query, "products"));
  if (params.type === "stores") return ok(paginate(db.stores.filter((s) => s.name.toLowerCase().includes(q)).map((s) => storeView(db, s)), query, "stores"));
  if (params.type === "users") return ok(paginate(db.users.filter((u) => u.name.toLowerCase().includes(q)).map(miniUser), query, "users"));
  return ok(paginate([], query, params.type));
});

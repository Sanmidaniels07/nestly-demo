// Collections: a seller's group of products shared as one link
// (/{store}/{collection} -> /c/{store}/{collection}). Same shapes as the
// real API (modules/collection).

import { getDB, type DemoDB, type Row } from "../db";
import { isListed, productById, storeOfUser } from "../model";
import { DemoError, created, fail, needUser, ok, route, type Ctx } from "../router";
import { newId, now } from "../util";

const SHOWN = ["PUBLISHED", "OUT_OF_STOCK"];
const list = (db: DemoDB) => (db.collections ??= []);
const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const mine = (ctx: Ctx) => {
  const user = needUser(ctx);
  const store = storeOfUser(getDB(), user.id);
  if (!store) throw new DemoError(403, "You must create a store first.");
  return { user, store };
};

const forSeller = (db: DemoDB, c: Row, storeSlug: string) => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  description: c.description,
  isActive: c.isActive,
  path: `/${storeSlug}/${c.slug}`,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
  products: (c.productIds as string[])
    .map((id) => productById(db, id))
    .filter((p): p is Row => !!p)
    .map((p) => ({ id: p.id, title: p.title, price: p.price, status: p.status, image: p.images[0]?.url ?? null })),
});

const checked = (db: DemoDB, storeId: string, ids: unknown) => {
  const productIds = [...new Set((Array.isArray(ids) ? ids : []) as string[])];
  if (productIds.length === 0) throw new DemoError(400, "Pick at least one product.");
  if (productIds.length > 50) throw new DemoError(400, "A collection can have up to 50 products.");
  for (const id of productIds) {
    const p = productById(db, id);
    if (!p || p.storeId !== storeId) throw new DemoError(400, "Some of those products aren't in your store.");
    if (!SHOWN.includes(p.status)) throw new DemoError(400, `"${p.title}" isn't listed in your shop - publish it first, or leave it out.`);
  }
  return productIds;
};

route("GET /collections/me", (ctx) => {
  const { store } = mine(ctx);
  const db = getDB();
  return ok(list(db).filter((c) => c.storeId === store.id).map((c) => forSeller(db, c, store.slug)));
});

route("POST /collections", (ctx) => {
  const { store } = mine(ctx);
  const db = getDB();
  const name = String(ctx.body.name ?? "").trim();
  if (name.length < 2) return fail(400, "Give the collection a name.");
  const productIds = checked(db, store.id, ctx.body.productIds);
  const base = slugify(name) || "collection";
  let slug = base;
  for (let i = 1; list(db).some((c) => c.storeId === store.id && c.slug === slug); i++) slug = `${base}-${i}`;
  const collection = {
    id: newId(),
    storeId: store.id,
    name,
    slug,
    description: String(ctx.body.description ?? "").trim() || null,
    isActive: true,
    productIds,
    createdAt: now(),
    updatedAt: now(),
  };
  list(db).unshift(collection);
  return created(forSeller(db, collection, store.slug), "Collection created");
});

route("PATCH /collections/:id", (ctx) => {
  const { store } = mine(ctx);
  const db = getDB();
  const c = list(db).find((x) => x.id === ctx.params.id && x.storeId === store.id);
  if (!c) return fail(404, "Collection not found.");
  if ("productIds" in ctx.body) c.productIds = checked(db, store.id, ctx.body.productIds);
  if (typeof ctx.body.name === "string" && ctx.body.name.trim().length >= 2) c.name = ctx.body.name.trim();
  if ("description" in ctx.body) c.description = String(ctx.body.description ?? "").trim() || null;
  if (typeof ctx.body.isActive === "boolean") c.isActive = ctx.body.isActive;
  c.updatedAt = now();
  return ok(forSeller(db, c, store.slug), "Collection updated");
});

route("DELETE /collections/:id", (ctx) => {
  const { store } = mine(ctx);
  const db = getDB();
  db.collections = list(db).filter((c) => !(c.id === ctx.params.id && c.storeId === store.id));
  return ok(null, "Collection deleted");
});

route("GET /collections/:store/:slug", ({ params }) => {
  const db = getDB();
  const store = db.stores.find((s) => s.slug === params.store);
  if (!store || store.isSuspended) return fail(404, "Collection not found.");
  const c = list(db).find((x) => x.storeId === store.id && x.slug === params.slug);
  if (!c) return fail(404, "Collection not found.");
  const products = c.isActive
    ? (c.productIds as string[])
        .map((id) => productById(db, id))
        .filter((p): p is Row => !!p && (isListed(db, p) || p.status === "OUT_OF_STOCK"))
        .map((p) => ({
          id: p.id,
          title: p.title,
          price: p.price,
          originalPrice: p.originalPrice ?? null,
          stock: p.stock,
          status: p.status,
          soldOut: p.status === "OUT_OF_STOCK" || p.stock <= 0,
          images: p.images.map((i: Row) => ({ url: i.url, isPrimary: i.isPrimary })),
          options: p.options ?? [],
          variations: (p.variations ?? []).filter((v: Row) => !v.isArchived),
        }))
    : [];
  return ok({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    isActive: c.isActive,
    store: {
      id: store.id,
      name: store.name,
      slug: store.slug,
      logo: store.logo,
      brandColor: store.brandColor ?? null,
      isVerified: store.isVerified,
      city: store.city,
      state: store.state,
      referralCode: null,
      canDeliver: db.shippingOptions.some((o) => o.storeId === store.id && !o.isArchived),
    },
    products,
  });
});

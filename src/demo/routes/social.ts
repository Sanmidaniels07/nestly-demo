// Posts, likes, comments, stories, communities, events, lives list and the
// dashboard summary.

import { getDB, type Row } from "../db";
import { miniUser, productById, storeById, storeOfUser, userById } from "../model";
import { created, fail, needUser, ok, paginate, route } from "../router";
import { newId, now } from "../util";

const postView = (p: Row, viewerId?: string) => {
  const db = getDB();
  const product = p.productId ? productById(db, p.productId) : null;
  const store = product ? storeById(db, product.storeId) : null;
  return {
    ...p,
    author: miniUser(userById(db, p.authorId)),
    likeCount: p.likes.length,
    likedByMe: !!viewerId && p.likes.includes(viewerId),
    commentCount: p.comments.length,
    _count: { likes: p.likes.length, comments: p.comments.length },
    product: product && store ? { id: product.id, title: product.title, price: product.price, image: product.images[0]?.url, store: { name: store.name, slug: store.slug } } : null,
  };
};

route("GET /posts", ({ query, user }) => {
  const db = getDB();
  let posts = db.posts.filter((p) => !p.isDeleted).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (query.authorId || query.userId) posts = posts.filter((p) => p.authorId === (query.authorId || query.userId));
  return ok(paginate(posts.map((p) => postView(p, user?.id)), query, "posts"));
});
route("GET /posts/:id", ({ params, user }) => {
  const post = getDB().posts.find((p) => p.id === params.id && !p.isDeleted);
  return post ? ok(postView(post, user?.id)) : fail(404, "Post not found.");
});
route("POST /posts", (ctx) => {
  const user = needUser(ctx);
  const content = String(ctx.body.content ?? "");
  const media = (ctx.body.media as Row[] | undefined) ?? (ctx.body.images as string[] | undefined)?.map((url, order) => ({ url, type: "IMAGE", order })) ?? [];
  const post = {
    id: newId(),
    title: null,
    content,
    authorId: user.id,
    isDeleted: false,
    productId: (ctx.body.productId as string) ?? null,
    createdAt: now(),
    media: media.map((m, i) => ({ id: newId(), url: m.url, type: m.type ?? "IMAGE", order: i })),
    likes: [] as string[],
    comments: [] as Row[],
    hashtags: (content.match(/#(\w+)/g) ?? []).map((h) => h.slice(1)),
  };
  getDB().posts.unshift(post);
  return created(postView(post, user.id), "Posted");
});
route("PATCH /posts/:id", (ctx) => {
  const user = needUser(ctx);
  const post = getDB().posts.find((p) => p.id === ctx.params.id && p.authorId === user.id);
  if (!post) return fail(404, "Post not found.");
  if (typeof ctx.body.content === "string") post.content = ctx.body.content;
  return ok(postView(post, user.id));
});
route("DELETE /posts/:id", (ctx) => {
  const user = needUser(ctx);
  const post = getDB().posts.find((p) => p.id === ctx.params.id && p.authorId === user.id);
  if (post) post.isDeleted = true;
  return ok(null, "Deleted");
});

route("POST /likes/:postId", (ctx) => {
  const user = needUser(ctx);
  const post = getDB().posts.find((p) => p.id === ctx.params.postId);
  if (post && !post.likes.includes(user.id)) post.likes.push(user.id);
  return ok(null, "Liked");
});
route("DELETE /likes/:postId", (ctx) => {
  const user = needUser(ctx);
  const post = getDB().posts.find((p) => p.id === ctx.params.postId);
  if (post) post.likes = post.likes.filter((id: string) => id !== user.id);
  return ok(null, "Unliked");
});
route("GET /likes/:postId", ({ params, query }) => {
  const db = getDB();
  const post = db.posts.find((p) => p.id === params.postId);
  return ok(paginate((post?.likes ?? []).map((id: string) => miniUser(userById(db, id))), query, "likes"));
});

const commentView = (c: Row) => ({ ...c, author: miniUser(userById(getDB(), c.authorId)), user: miniUser(userById(getDB(), c.authorId)) });
route("GET /comments/post/:postId", ({ params }) => {
  const post = getDB().posts.find((p) => p.id === params.postId);
  return ok((post?.comments ?? []).map(commentView));
});
route("POST /comments/post/:postId", (ctx) => {
  const user = needUser(ctx);
  const post = getDB().posts.find((p) => p.id === ctx.params.postId);
  if (!post) return fail(404, "Post not found.");
  const comment = { id: newId(), postId: post.id, authorId: user.id, content: String(ctx.body.content ?? ""), parentId: (ctx.body.parentId as string) ?? null, createdAt: now(), updatedAt: now() };
  post.comments.push(comment);
  return created(commentView(comment), "Comment added");
});

// Stories: a couple of sellers with something new today.
route("GET /stories", () => {
  const db = getDB();
  const story = (userId: string, productId: string, minutes: number) => {
    const product = productById(db, productId)!;
    return { id: `story_${userId}_${productId}`, mediaUrl: product.images[0].url, mediaType: "IMAGE", caption: product.title, createdAt: new Date(Date.now() - minutes * 60000).toISOString(), expiresAt: new Date(Date.now() + 20 * 3600000).toISOString(), viewed: false, viewedByMe: false };
  };
  return ok([
    { author: miniUser(userById(db, "u_tola")), user: miniUser(userById(db, "u_tola")), stories: [story("u_tola", "p_002", 40), story("u_tola", "p_005", 30)], hasUnseen: true, allViewed: false },
    { author: miniUser(userById(db, "u_bisi")), user: miniUser(userById(db, "u_bisi")), stories: [story("u_bisi", "p_008", 90)], hasUnseen: true, allViewed: false },
    { author: miniUser(userById(db, "u_zainab")), user: miniUser(userById(db, "u_zainab")), stories: [story("u_zainab", "p_030", 200)], hasUnseen: true, allViewed: false },
  ]);
});

const TAGS: [string, number][] = [["cakes", 128], ["sneakers", 96], ["skincare", 74], ["lagos", 61], ["owambe", 40]];
route("GET /hashtags/trending", () => ok(TAGS.map(([tag, postCount]) => ({ hashtag: { id: `tag_${tag}`, tag, createdAt: now() }, postCount }))));
route("GET /hashtags/:tag/posts", ({ params, query, user }) => {
  const posts = getDB().posts.filter((p) => !p.isDeleted && p.hashtags.includes(params.tag));
  return ok(paginate(posts.map((p) => postView(p, user?.id)), query, "posts"));
});

route("GET /communities", ({ query }) => ok(paginate([], query, "communities")));
route("GET /communities/trending", () => ok([]));
route("GET /events", ({ query }) => ok(paginate([], query, "events")));

// ---- lives (list) ----
export const liveCard = (l: Row) => {
  const db = getDB();
  const store = storeById(db, l.storeId)!;
  const products = l.productIds.map((id: string) => productById(db, id)).filter(Boolean) as Row[];
  return {
    id: l.id,
    code: l.code,
    title: l.title,
    description: l.description ?? null,
    coverImage: products[0]?.images[0]?.url ?? null,
    scheduledAt: l.scheduledFor ?? l.startedAt ?? l.createdAt,
    startedAt: l.startedAt,
    endedAt: l.endedAt,
    endsAt: l.startedAt ? new Date(new Date(l.startedAt).getTime() + 60 * 60000).toISOString() : null,
    status: l.status,
    endReason: null,
    pinnedProductId: l.pinnedProductId,
    discountActive: l.status === "LIVE",
    interestedCount: 37,
    viewers: l.viewers,
    store: { id: store.id, name: store.name, slug: store.slug, logo: store.logo, city: store.city, state: store.state, isVerified: store.isVerified, rating: store.rating, sellerUserId: db.sellers.find((x) => x.id === store.sellerId)?.userId },
    products: products.map((p) => {
      const livePrice = l.livePrices[p.id] ?? null;
      return {
        id: p.id,
        slug: p.slug,
        title: p.title,
        image: p.images[0]?.url ?? null,
        price: p.price,
        maxPrice: p.price,
        discountPercent: livePrice ? Math.round((1 - livePrice / p.price) * 100) : null,
        livePrice,
        hasOptions: false,
        stock: p.stock,
        available: p.stock > 0,
      };
    }),
  };
};
route("GET /lives", () => {
  const db = getDB();
  return ok({ live: db.lives.filter((l) => l.status === "LIVE").map(liveCard), upcoming: db.lives.filter((l) => l.status === "SCHEDULED").map(liveCard) });
});

// ---- dashboard summary ----
route("GET /dashboard", (ctx) => {
  const user = needUser(ctx);
  const db = getDB();
  const orders = db.orders.filter((o) => o.userId === user.id && o.status !== "PENDING");
  const days = 30;
  const activity = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 86400000);
    const seed = (d.getDate() * 7 + user.id.length) % 11;
    return { date: d.toISOString().slice(0, 10), likes: seed % 4, views: 3 + seed, followers: seed % 5 === 0 ? 1 : 0 };
  });
  const store = storeOfUser(db, user.id);
  const myPosts = db.posts.filter((p) => p.authorId === user.id);
  return ok({
    range: { days, since: new Date(Date.now() - days * 86400000).toISOString() },
    social: {
      followers: db.follows.filter((f) => f.userId === user.id).length,
      following: db.follows.filter((f) => f.followerId === user.id).length,
      posts: myPosts.length,
      likesReceived: myPosts.reduce((a, p) => a + p.likes.length, 0),
      commentsReceived: myPosts.reduce((a, p) => a + p.comments.length, 0),
      profileViews: 132,
      newFollowers: 4,
      newLikes: 12,
    },
    activity,
    shopping: {
      totalOrders: orders.length,
      activeOrders: orders.filter((o) => !["DELIVERED", "CANCELLED"].includes(o.status)).length,
      awaitingConfirmation: 0,
      totalSpent: orders.reduce((a, o) => a + o.total, 0),
      wishlistCount: db.wishlist.filter((w) => w.userId === user.id).length,
      cartItems: db.carts.find((c) => c.userId === user.id)?.items.length ?? 0,
    },
    community: { communitiesJoined: 0, upcomingEvents: [] },
    inbox: {
      unreadNotifications: db.notifications.filter((n) => n.userId === user.id && !n.isRead).length,
      unreadMessages: db.messages.filter((m) => !m.readAt && m.senderId !== user.id && db.conversations.find((c) => c.id === m.conversationId)?.participants.includes(user.id)).length,
    },
    upcomingBirthdays: [],
    seller: store
      ? {
          storeName: store.name,
          storeSlug: store.slug,
          newOrders: db.orders.filter((o) => o.status === "PAID" && o.shipping.some((s: Row) => s.storeId === store.id)).length,
          sales: db.orders.filter((o) => o.status !== "PENDING" && o.shipping.some((s: Row) => s.storeId === store.id)).reduce((a, o) => a + o.subtotal, 0),
        }
      : null,
  });
});

// ---- seller profile (404 for shoppers, like the real API) ----
route("GET /seller/me", (ctx) => {
  const user = needUser(ctx);
  const db = getDB();
  const seller = db.sellers.find((s) => s.userId === user.id);
  if (!seller) return fail(404, "You haven't applied to sell yet.");
  const store = db.stores.find((s) => s.sellerId === seller.id);
  return ok({ ...seller, store: store ? { id: store.id, name: store.name, slug: store.slug, underReview: store.underReview } : null, user: miniUser(user) });
});


route("GET /push/config", () => ok({ publicKey: null }));

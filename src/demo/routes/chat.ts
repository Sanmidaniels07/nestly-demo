// Chats. When the visitor messages someone, the other side "types" and
// replies a few seconds later, so conversations feel alive in the demo.

import { getDB, saveDB, type Row } from "../db";
import { serverPush } from "../fake-socket";
import { miniUser, productById, storeById, storeOfUser, userById } from "../model";
import { created, fail, needUser, ok, paginate, route } from "../router";
import { newId, now } from "../util";

export const messageView = (m: Row) => {
  const db = getDB();
  const product = m.productId ? productById(db, m.productId) : null;
  const store = product ? storeById(db, product.storeId) : null;
  const offer = m.offerId ? db.offers.find((o) => o.id === m.offerId) : null;
  return {
    ...m,
    sender: miniUser(userById(db, m.senderId)),
    replyTo: m.replyToId ? db.messages.find((x) => x.id === m.replyToId) ?? null : null,
    product: product && store ? { id: product.id, title: product.title, price: product.price, image: product.images[0]?.url, stock: product.stock, store: { name: store.name, slug: store.slug } } : null,
    offer: offer ? offerCard(offer) : null,
  };
};

// Filled in by routes/offers.ts (offers are shown as cards in the chat).
export let offerCard: (offer: Row) => Row = (offer) => offer;
export const setOfferCard = (fn: (offer: Row) => Row) => (offerCard = fn);

const conversationView = (c: Row, viewerId: string) => {
  const db = getDB();
  const otherId = c.participants.find((id: string) => id !== viewerId);
  const other = userById(db, otherId);
  const store = storeOfUser(db, otherId);
  const messages = db.messages.filter((m) => m.conversationId === c.id && !m.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const last = messages[messages.length - 1];
  return {
    id: c.id,
    otherParticipant: other
      ? { ...miniUser(other), lastSeenAt: now(), online: !!store, store: store ? { name: store.name, slug: store.slug } : null }
      : null,
    lastMessage: last ? { ...last, product: null, offer: last.offerId ? { title: db.offers.find((o) => o.id === last.offerId)?.title, price: db.offers.find((o) => o.id === last.offerId)?.price } : null } : null,
    unreadCount: messages.filter((m) => m.senderId !== viewerId && !m.readAt).length,
    updatedAt: c.updatedAt,
  };
};

const mine = (conversationId: string, userId: string) => {
  const c = getDB().conversations.find((x) => x.id === conversationId);
  return c && c.participants.includes(userId) ? c : null;
};

export const conversationBetween = (a: string, b: string) => {
  const db = getDB();
  let c = db.conversations.find((x) => x.participants.includes(a) && x.participants.includes(b));
  if (!c) {
    c = { id: newId(), participants: [a, b], createdAt: now(), updatedAt: now() };
    db.conversations.push(c);
  }
  return c;
};

/** Adds a message and tells the app (socket "message:new"). */
export const postMessage = (conversationId: string, senderId: string, fields: Partial<Row>) => {
  const db = getDB();
  const message = { id: newId(), conversationId, senderId, content: null, replyToId: null, productId: null, offerId: null, readAt: null, deletedAt: null, createdAt: now(), media: [], reactions: [], ...fields };
  db.messages.push(message);
  const c = db.conversations.find((x) => x.id === conversationId);
  if (c) c.updatedAt = message.createdAt;
  saveDB();
  serverPush("main", "message:new", messageView(message));
  return message;
};

// What a seller says back, by what the buyer asked.
const replyFor = (text: string, sellerId: string, productId?: string | null) => {
  const db = getDB();
  const store = storeOfUser(db, sellerId);
  const product = productId ? productById(db, productId) : null;
  const t = text.toLowerCase();
  if (product) return `Yes, "${product.title}" is available (${product.stock} left). You can buy it right from the listing - Nestly holds your payment until you get it 🙌`;
  if (/deliver|ship|location|lekki|ikeja|island|mainland|abuja/.test(t)) return `We deliver across ${store?.state ?? "Lagos"} - same day in ${store?.city ?? "town"}, next day elsewhere. Pickup is free too.`;
  if (/price|discount|last|reduce|cheaper|how much/.test(t)) return "I can do a small discount 😊 Tap \"Make an offer\" below and send me your price.";
  if (/available|stock|in stock|still have/.test(t)) return "Yes it's available! Order on Nestly and I'll start preparing it today.";
  if (/cake|birthday|message|write/.test(t)) return "Lovely! I'll write any message you want on top. Send me a payment link request or order from my shop 🎂";
  if (/thank|thanks|ok|okay|great/.test(t)) return "You're welcome! 💜";
  return "Hi! Thanks for reaching out. How can I help? You can also make an offer right here in the chat.";
};

const scheduleReply = (conversationId: string, buyerId: string, sellerId: string, text: string, productId?: string | null) => {
  const store = storeOfUser(getDB(), sellerId);
  if (!store && !userById(getDB(), sellerId)) return;
  setTimeout(() => serverPush("main", "typing", { conversationId, userId: sellerId }), 900);
  setTimeout(() => serverPush("main", "typing", { conversationId, userId: sellerId }), 2400);
  setTimeout(() => {
    // The seller reads it first.
    getDB()
      .messages.filter((m) => m.conversationId === conversationId && m.senderId === buyerId && !m.readAt)
      .forEach((m) => (m.readAt = now()));
    serverPush("main", "message:read", { conversationId });
    postMessage(conversationId, sellerId, { content: store ? replyFor(text, sellerId, productId) : "😄 Sounds good!" });
  }, 3600);
};

route("GET /conversations", (ctx) => {
  const user = needUser(ctx);
  const db = getDB();
  const list = db.conversations
    .filter((c) => c.participants.includes(user.id))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((c) => conversationView(c, user.id));
  return ok(paginate(list, ctx.query, "conversations"));
});

route("POST /conversations", (ctx) => {
  const user = needUser(ctx);
  const otherId = String(ctx.body.userId ?? ctx.body.participantId ?? "");
  if (!userById(getDB(), otherId) || otherId === user.id) return fail(400, "Pick someone to message.");
  const c = conversationBetween(user.id, otherId);
  return created(conversationView(c, user.id), "Conversation ready");
});

route("GET /conversations/:id", (ctx) => {
  const user = needUser(ctx);
  const c = mine(ctx.params.id, user.id);
  return c ? ok(conversationView(c, user.id)) : fail(404, "Conversation not found.");
});

route("GET /conversations/:id/messages", (ctx) => {
  const user = needUser(ctx);
  const c = mine(ctx.params.id, user.id);
  if (!c) return fail(404, "Conversation not found.");
  const messages = getDB()
    .messages.filter((m) => m.conversationId === c.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(messageView);
  return ok(paginate(messages, { ...ctx.query, limit: ctx.query.limit ?? "50" }, "messages"));
});

route("POST /conversations/:id/messages", (ctx) => {
  const user = needUser(ctx);
  const c = mine(ctx.params.id, user.id);
  if (!c) return fail(404, "Conversation not found.");
  const content = typeof ctx.body.content === "string" ? ctx.body.content : null;
  const productId = (ctx.body.productId as string) ?? null;
  const message = postMessage(c.id, user.id, {
    content,
    productId,
    replyToId: (ctx.body.replyToId as string) ?? null,
    media: ((ctx.body.media as Row[]) ?? []).map((m) => ({ id: newId(), url: m.url, type: m.type ?? "IMAGE" })),
  });
  const otherId = c.participants.find((id: string) => id !== user.id);
  scheduleReply(c.id, user.id, otherId, content ?? "", productId);
  return created(messageView(message), "Sent");
});

route("PATCH /conversations/:id/read", (ctx) => {
  const user = needUser(ctx);
  getDB()
    .messages.filter((m) => m.conversationId === ctx.params.id && m.senderId !== user.id && !m.readAt)
    .forEach((m) => (m.readAt = now()));
  return ok(null);
});

route("PUT /conversations/:id/messages/:messageId/reaction", (ctx) => {
  const user = needUser(ctx);
  const m = getDB().messages.find((x) => x.id === ctx.params.messageId);
  if (!m) return fail(404, "Message not found.");
  m.reactions = (m.reactions ?? []).filter((r: Row) => r.userId !== user.id);
  if (ctx.body.emoji) m.reactions.push({ userId: user.id, emoji: ctx.body.emoji, user: miniUser(user) });
  serverPush("main", "message:updated", messageView(m));
  return ok(messageView(m));
});

route("DELETE /conversations/:id/messages/:messageId", (ctx) => {
  const user = needUser(ctx);
  const m = getDB().messages.find((x) => x.id === ctx.params.messageId && x.senderId === user.id);
  if (!m) return fail(404, "Message not found.");
  m.deletedAt = now();
  m.content = null;
  serverPush("main", "message:updated", messageView(m));
  return ok(messageView(m));
});

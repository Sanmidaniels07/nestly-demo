// A believable past for the demo world, made with the same rules the live
// handlers use: orders at every stage, chats, posts, notifications and a
// group gift in progress.

import type { DemoDB, Row } from "./db";
import { advanceItem, createOrder, markPaid } from "./model";
import { daysAgo, inDays, minutesAgo, newId } from "./util";

const placeOrder = (db: DemoDB, userId: string, productIds: [string, number][], storeOption: Record<string, string>, daysBack: number, stage: "PAID" | "PROCESSING" | "SHIPPED" | "DELIVERED") => {
  const at = daysAgo(daysBack, 3);
  const address = db.addresses.find((a) => a.userId === userId && a.isDefault) ?? null;
  const order = createOrder(db, {
    userId,
    lines: productIds.map(([productId, quantity]) => ({ productId, quantity })),
    address,
    shipping: storeOption,
    createdAt: at,
  });
  markPaid(db, order, daysAgo(daysBack, 2.9), true);
  const order2 = order as Row;
  const steps = ["PROCESSING", "SHIPPED", "DELIVERED"];
  const until = steps.indexOf(stage);
  steps.slice(0, until + 1).forEach((status, i) => {
    for (const item of order2.items) advanceItem(db, order2, item, status, daysAgo(daysBack - (i + 1) * 0.3, 0));
  });
  return order2;
};

const conversation = (db: DemoDB, a: string, b: string, lines: [string, string, number][]) => {
  const id = newId();
  db.conversations.push({ id, participants: [a, b], createdAt: daysAgo(10), updatedAt: minutesAgo(lines[lines.length - 1][2]) });
  for (const [senderId, content, minutes] of lines) {
    db.messages.push({
      id: newId(),
      conversationId: id,
      senderId,
      content,
      replyToId: null,
      productId: null,
      offerId: null,
      readAt: minutes > 30 ? minutesAgo(minutes - 1) : null,
      deletedAt: null,
      createdAt: minutesAgo(minutes),
      media: [],
      reactions: [],
    });
  }
  return id;
};

export const addHistory = (db: DemoDB) => {
  // Ada's orders: one delivered (reviewable), one on its way, one being prepared.
  placeOrder(db, "u_ada", [["p_029", 1]], { st_zainab: "so_zainab_city" }, 9, "DELIVERED");
  placeOrder(db, "u_ada", [["p_008", 1]], { st_bisi: "so_bisi_island" }, 2, "SHIPPED");
  placeOrder(db, "u_ada", [["p_005", 2]], { st_tola: "so_tola_island" }, 0.4, "PROCESSING");

  // Tola's shop: new orders waiting, one being prepared, many delivered.
  placeOrder(db, "u_kunle", [["p_001", 1]], { st_tola: "so_tola_mainland" }, 0.1, "PAID");
  placeOrder(db, "u_amaka", [["p_004", 2]], { st_tola: "so_tola_pickup" }, 0.25, "PAID");
  placeOrder(db, "u_tobi", [["p_002", 1]], { st_tola: "so_tola_island" }, 1, "PROCESSING");
  [
    ["u_tolu", "p_003", 6],
    ["u_amaka", "p_006", 8],
    ["u_kunle", "p_007", 12],
    ["u_tobi", "p_004", 15],
    ["u_ada", "p_001", 20],
  ].forEach(([user, product, back]) => placeOrder(db, user as string, [[product as string, 1]], { st_tola: "so_tola_city" }, back as number, "DELIVERED"));

  // Other shops get some sales too, so the marketplace feels busy.
  placeOrder(db, "u_kunle", [["p_023", 1]], { st_emeka: "so_emeka_city" }, 4, "DELIVERED");
  placeOrder(db, "u_tolu", [["p_014", 2]], { st_funmi: "so_funmi_mainland" }, 3, "DELIVERED");
  placeOrder(db, "u_amaka", [["p_030", 1]], { st_zainab: "so_zainab_city" }, 5, "DELIVERED");

  // Chats.
  conversation(db, "u_ada", "u_tola", [
    ["u_ada", "Hi Tola! Can you do a chocolate drip cake for Saturday?", 180],
    ["u_tola", "Hi Ada 😊 Yes I can. What should I write on it?", 170],
    ["u_ada", "\"Happy birthday Tolu 🎉\" please", 165],
    ["u_tola", "Perfect. I'll send you a payment link so it's held safely till delivery.", 160],
  ]);
  conversation(db, "u_kunle", "u_tola", [
    ["u_kunle", "Do you deliver to Ikeja?", 50],
    ["u_tola", "Yes! Next-day delivery to Ikeja is ₦3,000.", 45],
  ]);
  conversation(db, "u_ada", "u_bisi", [
    ["u_ada", "Are the Cloud Runners true to size?", 2900],
    ["u_bisi", "Yes they are. Your order is on the way now 🚚", 120],
  ]);

  // Posts in the feed.
  const post = (authorId: string, content: string, productId: string | null, photo: string | null, minutes: number, likes: string[]) =>
    db.posts.push({
      id: newId(),
      title: null,
      content,
      authorId,
      isDeleted: false,
      productId,
      createdAt: minutesAgo(minutes),
      media: photo ? [{ id: newId(), url: photo, type: "IMAGE", order: 0 }] : [],
      likes,
      comments: [],
      hashtags: (content.match(/#(\w+)/g) ?? []).map((h) => h.slice(1)),
    });
  const photo = (id: string) => db.products.find((p) => p.id === id)!.images[0].url;
  post("u_tola", "Weekend orders are open! Three slots left for Saturday 🎂 #cakes #lagos", "p_001", photo("p_001"), 95, ["u_ada", "u_kunle", "u_tolu"]);
  post("u_bisi", "New drop: Cloud Runners in fresh colours. Sizes 38-45 👟 #sneakers", "p_008", photo("p_008"), 260, ["u_ada", "u_tobi"]);
  post("u_zainab", "Your 4-step glow routine, in one box ✨ #skincare", "p_030", photo("p_030"), 600, ["u_amaka", "u_ada"]);
  post("u_ada", "Got my glow set from @zeebeauty and my skin is thanking me 😍", null, null, 1400, ["u_amaka", "u_zainab", "u_tolu"]);
  post("u_emeka", "Studio headphones back in stock. 6-month warranty as always. #gadgets", "p_023", photo("p_023"), 2000, ["u_kunle"]);

  // A group gift in progress: Tolu's birthday cake.
  db.groupGifts.push({
    id: "gg_tolu",
    code: "TOLU30",
    organizerId: "u_ada",
    recipientId: "u_tolu",
    recipientName: "Tolu",
    message: "Happy 30th Tolu! From the squad 🎉",
    storeId: "st_tola",
    productId: "p_002",
    variationId: null,
    shippingOptionId: "so_tola_mainland",
    unitPrice: 45000,
    deliveryFee: 3000,
    target: 48000,
    deadline: inDays(2),
    status: "OPEN",
    closedAt: null,
    giftId: null,
    createdAt: daysAgo(1),
    contributions: [
      { id: newId(), userId: "u_ada", amount: 15000, message: "Love you Tolu!", hideName: false, status: "PAID", refundedAmount: 0, paidAt: daysAgo(1), paymentReference: "NESTLY_CHIPIN_a1" },
      { id: newId(), userId: "u_amaka", amount: 10000, message: "Happy birthday 🎂", hideName: false, status: "PAID", refundedAmount: 0, paidAt: daysAgo(0.8), paymentReference: "NESTLY_CHIPIN_a2" },
      { id: newId(), userId: "u_kunle", amount: 8000, message: null, hideName: true, status: "PAID", refundedAmount: 0, paidAt: daysAgo(0.5), paymentReference: "NESTLY_CHIPIN_a3" },
    ],
  });

  // Notifications: a few for each persona, oldest first so the newest are on top.
  const note = (userId: string, type: string, title: string, message: string, targetType: string | null, targetId: string | null, minutes: number, isRead = false) =>
    db.notifications.push({ id: newId(), userId, type, title, message, targetType, targetId, isRead, createdAt: minutesAgo(minutes) });
  const adaShipped = db.orders.find((o) => o.userId === "u_ada" && o.status === "SHIPPED");
  note("u_ada", "ORDER", "Your order is on the way 🚚", "Bisi Kicks shipped your Cloud Runner Sneakers. Keep your delivery code ready.", "ORDER", adaShipped?.id ?? null, 120);
  note("u_ada", "SYSTEM", "Tolu's group gift is 69% there", "₦33,000 of ₦48,000 raised for Tolu's birthday cake. 2 days left.", "GROUP_GIFT", "TOLU30", 300);
  note("u_ada", "SOCIAL", "Amaka liked your post", "Amaka liked: \"Got my glow set from @zeebeauty…\"", null, null, 900, true);
  const kunle = db.orders.find((o) => o.userId === "u_kunle" && o.status === "PAID");
  note("u_tola", "ORDER", "New order 🎉", "Kunle Bakare paid for Chocolate Drip Celebration Cake.", "SELLER_ORDER", kunle?.id ?? null, 6);
  const amaka = db.orders.find((o) => o.userId === "u_amaka" && o.status === "PAID");
  note("u_tola", "ORDER", "New order 🎉", "Amaka Udeh paid for Strawberry Cupcakes (Box of 6).", "SELLER_ORDER", amaka?.id ?? null, 15);
  note("u_tola", "SELLER_EARNINGS", "Payout sent 💸", "₦58,420 is on its way to your GTBank account.", "SELLER_EARNINGS", "st_tola", 1500, true);
  note("u_yusuf", "SYSTEM", "New seller to review", "Ngozi's Kitchen opened with quick start. Review them today.", "SELLER_REVIEW", "sp_ngozi", 40);

  // Payout history for Tola.
  db.payouts.push(
    { id: newId(), storeId: "st_tola", amount: 58420, status: "SUCCESS", reference: "PO_7781", createdAt: daysAgo(1), orders: 3 },
    { id: newId(), storeId: "st_tola", amount: 41300, status: "SUCCESS", reference: "PO_7712", createdAt: daysAgo(8), orders: 2 }
  );

  // Lives: Bisi is live now, Tola goes live tomorrow.
  db.lives.push(
    { id: "live_bisi", code: "BISILIVE", storeId: "st_bisi", hostId: "u_bisi", title: "Weekend sneaker drop 👟 live prices", status: "LIVE", scheduledFor: null, startedAt: minutesAgo(12), endedAt: null, viewers: 214, productIds: ["p_008", "p_009", "p_010", "p_013"], livePrices: { p_008: 33000, p_010: 30000 }, pinnedProductId: "p_008", createdAt: daysAgo(1) },
    { id: "live_tola", code: "TOLALIVE", storeId: "st_tola", hostId: "u_tola", title: "Cake decorating + live-only cupcake prices 🧁", status: "SCHEDULED", scheduledFor: inDays(1), startedAt: null, endedAt: null, viewers: 0, productIds: ["p_004", "p_005", "p_006"], livePrices: { p_004: 8000 }, pinnedProductId: null, createdAt: daysAgo(0.5) }
  );

};

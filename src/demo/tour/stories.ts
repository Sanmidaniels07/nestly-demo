// The guided stories, told by the Nestly cast.

import { queryClient } from "@/src/lib/query-client";

import { getDB, saveDB } from "../db";
import { advanceItem, createOrder, markPaid, notify, storeOfUser } from "../model";
import { createLink } from "../routes/links";
import { orderNumber } from "../util";
import type { Story } from "./engine";

const refresh = () => queryClient.invalidateQueries();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const onPage = (path: string) => () => window.location.pathname.startsWith(path);
const pageHas = (re: RegExp) => () => re.test(document.body.innerText);

// Tola's story keeps track of the link and order it creates.
const tolaStory: { linkId?: string; orderId?: string } = {};

const sellerDmToPaid: Story = {
  id: "seller-dm-to-paid",
  persona: "seller",
  title: "From a DM to a paid order",
  blurb: "Kunle asks for a cake in Tola's DMs. Watch it become a safe, paid, delivered order.",
  minutes: 2,
  who: "tola",
  steps: [
    {
      path: "/settings/marketplace",
      title: "Hi, I'm Tola 👋",
      body: "I bake celebration cakes in Lekki. Most of my customers find me on Instagram - let me show you how Nestly turns their DMs into paid orders, with no fake alerts.",
    },
    {
      target: { text: /^Payment links$/ },
      advance: "click",
      title: "Kunle wants a cake",
      body: "He messaged me on Instagram. Instead of \"send to my account\", I make a Nestly payment link. Tap Payment links.",
    },
    {
      run: async () => {
        const db = getDB();
        const store = storeOfUser(db, "u_tola")!;
        const link = createLink(db, store, {
          title: "Chocolate Drip Cake for Kunle",
          description: "Three layers, ganache drip, \"Happy birthday Mum\" on top.",
          price: 32000,
          quantity: 1,
          categoryId: "cat_cakes-pastries",
          deliveryType: "DELIVERY",
          deliveryFee: 3000,
          images: [{ url: db.products.find((p) => p.id === "p_001")!.images[0].url, isPrimary: true }],
        });
        tolaStory.linkId = link.id;
        saveDB();
        await refresh();
      },
      delay: 900,
      target: { text: /^Copy link$/ },
      title: "A link in 20 seconds",
      body: "I just made one: ₦32,000 for the cake plus ₦3,000 delivery. I copy it and paste it into our chat - Kunle pays through Nestly, not into my account.",
    },
    {
      run: async () => {
        const db = getDB();
        const link = db.paymentLinks.find((l) => l.id === tolaStory.linkId);
        if (!link) return;
        const address = db.addresses.find((a) => a.userId === "u_kunle")!;
        const order = createOrder(db, {
          userId: "u_kunle",
          lines: [{ productId: link.productId, quantity: 1 }],
          address,
          shipping: { [link.storeId]: { name: "Delivery (agreed with seller)", fee: 3000, type: "DELIVERY" } },
          source: "PAYMENT_LINK",
          paymentLinkId: link.id,
        });
        await sleep(600);
        markPaid(db, order);
        // The code Kunle reads out later in the story.
        order.shipping[0].deliveryCode = "481207";
        tolaStory.orderId = order.id;
        saveDB();
        await refresh();
      },
      delay: 1600,
      title: "Ding! Kunle just paid 💸",
      body: "₦35,000, paid by card. Nestly holds it - not me, not Kunle - until he has his cake. He gets a private delivery code; I get a new order.",
    },
    {
      target: { text: /^Orders$/ },
      advance: "click",
      title: "Let's open the order",
      body: "Tap Orders.",
    },
    {
      delay: 700,
      target: { selector: "div, article, li", text: /Chocolate Drip Cake for Kunle/ },
      title: "Everything I need to deliver",
      body: "Kunle's name, address and phone - only for this order. I bake, box it and send it with my rider.",
      run: async () => {
        const db = getDB();
        const order = db.orders.find((o) => o.id === tolaStory.orderId);
        if (!order) return;
        for (const item of order.items) advanceItem(db, order, item, "SHIPPED");
        notify(db, "u_kunle", "Your order is on the way 🚚", "Tola's Cakes shipped your cake. Keep your delivery code ready.", { type: "ORDER", id: order.id }, "ORDER");
        saveDB();
        await refresh();
      },
    },
    {
      run: async () => {
        await sleep(400);
        const db = getDB();
        const order = db.orders.find((o) => o.id === tolaStory.orderId);
        if (!order) return;
        for (const item of order.items) advanceItem(db, order, item, "DELIVERED");
        notify(db, "u_tola", "Delivered ✅", `Kunle confirmed order ${orderNumber(order.id)} with his delivery code. Your money is on its way after the return window.`, { type: "SELLER_ORDER", id: order.id }, "ORDER");
        saveDB();
        await refresh();
      },
      delay: 1200,
      who: "kunle",
      title: "\"Here's my code: 4 8 1 2 0 7\"",
      body: "At my door, I check the cake, then give the rider my 6-digit code. That code is the only thing that confirms delivery - no code, no payout.",
    },
    {
      target: { text: /^Earnings$/ },
      advance: "click",
      title: "Delivered = paid",
      body: "Tap Earnings to see the money coming to my bank.",
    },
    {
      delay: 800,
      celebrate: true,
      title: "No fake alerts. No chasing payments. 🎉",
      body: "After a short return window the money goes straight to my bank. That's selling on Nestly. Explore on your own, or try another story from the Demo button.",
    },
  ],
};

const buyerShopSafely: Story = {
  id: "buyer-shop-safely",
  persona: "buyer",
  title: "Shop safely, then chip in",
  blurb: "Ada buys cupcakes with a delivery code, then chips in on Tolu's birthday cake with friends.",
  minutes: 2,
  who: "ada",
  steps: [
    {
      path: "/marketplace/product/p_005",
      title: "Hi, I'm Ada 👋",
      body: "I want red velvet cupcakes for my sister. On Nestly I can see who I'm buying from before I pay.",
      delay: 600,
    },
    {
      target: { text: /^Add to cart$/ },
      advance: "click",
      title: "Looks good - add to cart",
      body: "The shop is verified, has real reviews and a track record. Tap Add to cart.",
    },
    {
      path: "/marketplace/cart",
      target: { text: /Proceed to checkout/i },
      advance: "click",
      title: "Off to checkout",
      body: "Tap Proceed to checkout.",
      delay: 600,
    },
    {
      target: { selector: "button", text: /Lekki \/ Victoria Island/ },
      advance: "click",
      title: "Where should it go?",
      body: "Tola delivers to my area for ₦3,500. Tap that delivery option.",
      delay: 900,
    },
    {
      target: { text: /^Proceed to payment$/ },
      advance: "click",
      title: "Almost there",
      body: "Tap Proceed to payment.",
    },
    {
      target: { text: /^Pay ₦/ },
      advance: onPage("/marketplace/order-success"),
      title: "Pay through Nestly",
      body: "The seller can't touch this money until I have my order. Tap Pay, then Pay in the payment sheet - it's all pretend here.",
      delay: 700,
    },
    {
      delay: 1200,
      title: "Paid! 🎉",
      body: "My order is in. I get a private delivery code - I only share it when the cupcakes are in my hands. Now, something fun…",
    },
    {
      path: "/chip-in/TOLU30",
      delay: 900,
      who: "tolu",
      title: "It's my birthday soon 🎈",
      body: "Ada started a group gift: a strawberry cake from Tola. Friends each chip in a part - Nestly holds it, and if it doesn't fill up, everyone is refunded.",
    },
    {
      target: { text: /^The rest/ },
      advance: "click",
      title: "Cover the rest",
      body: "₦15,000 is left. Tap \"The rest\".",
    },
    {
      target: { text: /^Chip in .*securely$/ },
      advance: pageHas(/48,000 of ₦48,000|100%/),
      title: "Chip in",
      body: "Tap Chip in, then Pay in the payment sheet.",
    },
    {
      celebrate: true,
      delay: 600,
      title: "100%! The cake is on its way 🎂",
      body: "The gift was placed the moment it filled up, and Tolu has been told something is coming. Explore on your own, or try another story from the Demo button.",
    },
  ],
};

const adminReview: Story = {
  id: "admin-review",
  persona: "admin",
  title: "Keep Nestly safe",
  blurb: "Yusuf reviews a brand-new shop that opened in 2 minutes.",
  minutes: 1,
  who: "yusuf",
  steps: [
    {
      path: "/admin",
      title: "Hi, I'm Yusuf 👋",
      body: "I look after Nestly's marketplace. Sales, sign-ups, commission - and above all, keeping buyers and honest sellers safe.",
      delay: 800,
    },
    {
      target: { text: /^Sellers$/ },
      advance: "click",
      title: "A new shop to review",
      body: "Tap Sellers.",
    },
    {
      delay: 800,
      target: { selector: "div", text: /^Ngozi Eze/ },
      title: "Ngozi opened her shop in 2 minutes",
      body: "With quick start she could sell straight away - but her payouts are held and each order is capped at ₦200,000 until I review her.",
    },
    {
      target: { text: /^Mark reviewed$/ },
      advance: "click",
      title: "She looks genuine",
      body: "Real products, sensible prices, no complaints. Tap Mark reviewed.",
    },
    {
      celebrate: true,
      delay: 800,
      title: "Reviewed ✅",
      body: "Her order limit is lifted and her payouts flow as usual. If she'd been a scammer, Reject as fraud would close her shop and refund every buyer automatically.",
    },
  ],
};

export const STORIES: Story[] = [sellerDmToPaid, buyerShopSafely, adminReview];
export const storyById = (id: string) => STORIES.find((s) => s.id === id) ?? null;

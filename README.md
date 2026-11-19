# Nestly demo

A sandbox of [Nestly](https://www.nestlyapp.site) that anyone can try in their browser: pick a character (a cake seller, a shopper or the admin), follow a guided story, or click around freely. It's the real Nestly website running on a pretend backend inside the browser.

**Nothing here is real.** There is no server, no database, no Paystack and no accounts. Every payment is pretend and nothing leaves the visitor's browser. The characters, shops and prices are made up.

## What visitors see

- **Start screen** (`/`): an animated stage. Pick Tola (seller) or Ada (shopper). The chosen card grows into the app.
- **Guided stories**, told by the characters with a moving spotlight, speech bubbles, live activity cards and confetti:
  - *From a DM to a paid order* (Tola): a payment link, Kunle pays, shipping, the delivery code, earnings.
  - *Shop safely, then chip in* (Ada): add to cart, checkout, the demo payment sheet, then chipping in on Tolu's birthday cake.
  - *Keep Nestly safe* (Yusuf, the admin): reviewing a brand-new quick-start shop. **Partners only** - see below.
- **Free roam**: every screen works and keeps changes until "Reset demo". Messages get typed replies, paid orders are prepared and shipped on their own, and new orders, payments and deliveries slide in as cards.
- **Demo button** (bottom of every screen): switch character, play a story, reset, or go back to the start.

## Admin (partners only)

Yusuf, the admin character, is hidden from the public demo: his story shows how Nestly's safety checks work (new-shop review, limits, held payouts, fraud stops), which buyers and sellers don't need and fraudsters shouldn't see. For investor and partner pitches, share **https://demo.nestlyapp.site/?for=partners** - the browser remembers it; `?for=public` switches back.

## How it works

```
src/            the Nestly website (copied from social-marketplace-app)
src/demo/       the demo layer - only in this repo
  adapter.ts      answers every API request in the browser (installed on axios)
  router.ts       "METHOD /path/:param" routes, same reply envelope as the real API
  routes/*.ts     the pretend API: catalogue, shop, checkout, chat, seller, links, admin...
  db.ts           the demo database, saved to the visitor's browser (localStorage)
  seed.ts         the demo world: characters, 7 shops, ~45 products, reviews
  history.ts      a believable past (orders at every stage, chats, posts, a group gift)
  model.ts        shared rules: API-shaped views, orders, payment, delivery codes
  payments.ts     pretend Paystack: what each payment is for, run when paid
  simulate.ts     the world moving on its own (orders prepared, then shipped)
  fake-socket.ts  stand-in for socket.io (chat, typing, read receipts)
  tour/           guided stories: engine, stories, spotlight layer, confetti
  ui/             start screen, demo controls, payment sheet, activity cards
demo-overlay/   website files the demo replaces (applied by the sync script)
scripts/        sync.mjs (follow the website) and export-cast.cjs (character art)
public/demo/    the characters as SVGs (from the Nestly brand kit)
```

The website's screens are unchanged. They call the API as usual; the demo's axios adapter answers instead of a server. Anything the demo hasn't built yet gets a safe empty answer and a console warning (`[nestly demo] no handler yet: ...`).

## Safety

- No API keys, secrets or backend: the demo can't reach Nestly's servers or databases.
- Payments open a demo sheet that charges nothing. Uploads stay in the browser.
- Not indexed by search engines: `noindex` on every page (header and meta), `robots.txt` blocks all crawlers, the sitemap is empty.
- Google sign-in, maps keys, ad tags and push are off.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

`.env` holds the only settings (no secrets): the in-browser API path and the noindex switch.

## Keep it in step with the website

```bash
npm run sync:pull  # copy the latest website code in, then apply the demo layer
npm run sync       # only re-apply the demo layer
```

The sync copies the website (never `src/demo`, `demo-overlay`, `scripts`, `public/demo`, this README or `.env`), lays `demo-overlay/` on top and makes five small injections: the adapter on axios, the demo controls in the layout, and no navbar on the start screen. If the website changed around an injection, the script stops and says where.

After a sync, run the app and watch the console for `no handler yet` warnings: those are new API calls the demo needs to answer (add them in `src/demo/routes/`).

## Deploy

A separate Vercel project (never the website's):

1. Push this repo to GitHub.
2. In Vercel: **Add New → Project**, import the repo. Framework: Next.js. No environment variables are needed (`.env` is committed).
3. Add the domain `demo.nestlyapp.site` (a CNAME to Vercel in your DNS).

## Adding a story

Stories live in `src/demo/tour/stories.ts`. Each step can open a page (`path`), spotlight an element (`target: { text: /^Orders$/ }`), wait for a tap (`advance: "click"`) or a condition (`advance: () => ...`), do something in the demo world (`run`), and end with confetti (`celebrate`). Add it to `STORIES` and it appears in the Demo panel and the welcome offer for its character.

## Characters

`npm run cast` re-exports the characters from the Nestly brand kit (`../Nestly-Brand-Kit/_source-set3/kit.js`) into `public/demo/people/`.

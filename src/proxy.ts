import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SITE_PAGES, STORE_SLUG } from "./lib/store-link";

// DEMO: the website's proxy looks short links up on the real API. The demo
// has no server-side API (its data lives in the browser), so short links go
// straight to the page and the page finds the store in the demo data:
//
//   /{store}              -> /marketplace/seller/{store}
//   /{store}/{collection} -> /c/{store}/{collection}
export function proxy(request: NextRequest) {
  const parts = request.nextUrl.pathname.slice(1).split("/").map((part) => decodeURIComponent(part).toLowerCase());
  const [name, collection] = parts;
  if (parts.length > 2 || name.length > 120 || !STORE_SLUG.test(name) || SITE_PAGES.has(name)) return NextResponse.next();
  if (collection !== undefined && !STORE_SLUG.test(collection)) return NextResponse.next();
  const target = new URL(collection ? `/c/${name}/${collection}` : `/marketplace/seller/${name}`, request.url);
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));
  return NextResponse.redirect(target, 307);
}

export const config = {
  matcher: ["/:name", "/:name/:collection"],
};

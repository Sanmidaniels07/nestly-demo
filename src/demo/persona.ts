import { useSyncExternalStore } from "react";

// Who the visitor is playing: a buyer, a seller or the admin. Chosen on the
// demo's start screen and kept in this browser (it replaces logging in).

export type PersonaKey = "buyer" | "seller" | "admin";

export const PERSONAS: Record<PersonaKey, { userId: string; name: string; avatar: string; role: string; start: string; blurb: string }> = {
  buyer: {
    userId: "u_ada",
    name: "Ada",
    avatar: "/demo/people/ada.svg",
    role: "Shopper",
    start: "/marketplace",
    blurb: "Shop from trusted sellers, pay safely and chip in on gifts with friends.",
  },
  seller: {
    userId: "u_tola",
    name: "Tola",
    avatar: "/demo/people/tola.svg",
    role: "Cake seller",
    start: "/settings/marketplace",
    blurb: "Turn DMs into paid orders, sell live and get paid straight to your bank.",
  },
  admin: {
    userId: "u_yusuf",
    name: "Yusuf",
    avatar: "/demo/people/yusuf.svg",
    role: "Nestly admin",
    start: "/admin",
    blurb: "Review new sellers, keep buyers safe and watch the marketplace grow.",
  },
};

const KEY = "nestly-demo:persona";

export const getPersonaUserId = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export const setPersonaUserId = (userId: string | null) => {
  try {
    if (userId) localStorage.setItem(KEY, userId);
    else localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
};

export const tokenFor = (userId: string) => `demo.${userId}`;
export const userIdFromToken = (header?: string | null) => {
  const token = (header ?? "").replace(/^Bearer\s+/i, "");
  return token.startsWith("demo.") ? token.slice(5) : null;
};

// The admin character is for partner and investor pitches only, not the
// public demo: it shows how Nestly's safety checks work. Opened with
// ?for=partners (remembered in this browser); ?for=public turns it off again.
const PARTNERS_KEY = "nestly-demo:partners";

export const isPartnersMode = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    const param = new URLSearchParams(window.location.search).get("for");
    if (param === "partners") localStorage.setItem(PARTNERS_KEY, "1");
    if (param === "public") localStorage.removeItem(PARTNERS_KEY);
    return localStorage.getItem(PARTNERS_KEY) === "1";
  } catch {
    return false;
  }
};

const PUBLIC: PersonaKey[] = ["seller", "buyer"];
const ALL: PersonaKey[] = ["seller", "buyer", "admin"];

/** The characters this visitor can play (same list on the server and first paint). */
export const usePersonaChoices = (): PersonaKey[] =>
  useSyncExternalStore(
    () => () => {},
    () => (isPartnersMode() ? ALL : PUBLIC),
    () => PUBLIC
  );

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

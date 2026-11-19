// Signing in as a demo persona, profile, addresses, notifications, follows.

import { getDB, type DemoUser, type Row } from "../db";
import { miniUser, storeOfUser, userById } from "../model";
import { getPersonaUserId, setPersonaUserId, tokenFor } from "../persona";
import { DemoError, created, fail, needUser, ok, paginate, route } from "../router";
import { newId, now } from "../util";

const profileOf = (u: DemoUser) => {
  const db = getDB();
  const hasAddress = db.addresses.some((a) => a.userId === u.id);
  const steps = [
    { key: "USERNAME", title: "Choose a username", why: "So people can find, mention and share your profile.", path: "/settings/profile", done: !!u.username },
    { key: "PHOTO", title: "Add a profile photo", why: "Buyers and sellers trust a face more than initials.", path: "/settings/profile", done: !!u.avatar },
    { key: "BIRTHDAY", title: "Add your birthday", why: "Your followers get a reminder to celebrate you. Your age stays private.", path: "/settings/profile", done: !!u.dateOfBirth },
    { key: "BIO", title: "Write a short bio", why: "A line about you helps people decide to follow you.", path: "/settings/profile", done: !!u.bio },
    { key: "ADDRESS", title: "Save a delivery address", why: "Check out in one tap when you find something you like.", path: "/settings/profile#addresses", done: hasAddress },
  ];
  return {
    ...u,
    recentlyViewed: undefined,
    profileCompletion: Math.round((steps.filter((s) => s.done).length / steps.length) * 100),
    hasPassword: true,
    hasGoogle: false,
    setupSteps: steps,
  };
};

const session = (u: DemoUser) => ({ accessToken: tokenFor(u.id), refreshToken: "demo", user: { id: u.id, name: u.name, email: u.email, role: u.role, isVerified: true } });

// The "cookie" session: whoever was picked on the demo start screen.
route("POST /session/refresh", () => {
  const db = getDB();
  const user = userById(db, getPersonaUserId());
  return user ? ok({ accessToken: tokenFor(user.id) }) : fail(401, "No session.");
});
route("POST /session/logout", () => {
  setPersonaUserId(null);
  return ok(null, "Logged out");
});

// Any demo account email logs straight in (no passwords in the demo).
route("POST /auth/login", ({ body }) => {
  const db = getDB();
  const email = String(body.email ?? "").toLowerCase().trim();
  const user = db.users.find((u) => u.email === email || u.username === email);
  if (!user) return fail(401, "Pick a demo account on the start screen, or use ada@demo.nestly, tola@demo.nestly or yusuf@demo.nestly.");
  setPersonaUserId(user.id);
  return ok(session(user), "Login successful");
});

// Signing up makes a fresh demo shopper, ready to use.
route("POST /auth/signup", ({ body }) => {
  const db = getDB();
  const email = String(body.email ?? "").toLowerCase().trim();
  if (db.users.some((u) => u.email === email)) return fail(409, "That email already has a demo account. Log in instead.");
  const user: DemoUser = {
    id: newId(),
    name: String(body.name ?? "New shopper"),
    email,
    username: email.split("@")[0].replace(/[^a-z0-9_.]/g, "") || `user${Date.now()}`,
    avatar: null,
    cover: null,
    bio: null,
    role: "USER",
    isVerified: true,
    dateOfBirth: (body.dateOfBirth as string) ?? null,
    createdAt: now(),
  };
  db.users.push(user);
  setPersonaUserId(user.id);
  return created(session(user), "Account created - you're signed in to the demo.");
});

route("POST /auth/google", () => fail(400, "Google sign-in is turned off in the demo. Pick a demo account instead."));
route("POST /auth/forgot-password", () => ok(null, "In the real app you'd get an email. In the demo, just pick an account."));
route("POST /verify-email/resend", () => ok(null, "Demo accounts are already verified."));

route("GET /profile", (ctx) => ok(profileOf(needUser(ctx))));
route("PATCH /profile", (ctx) => {
  const user = needUser(ctx);
  const allowed = ["name", "username", "bio", "avatar", "cover", "location", "website", "occupation", "company", "education", "dateOfBirth", "socialLinks", "skills", "interests", "languages"];
  for (const key of allowed) if (key in ctx.body) (user as Row)[key] = ctx.body[key];
  return ok(profileOf(user), "Profile updated");
});

// ---- addresses ----
route("GET /addresses", (ctx) => {
  const user = needUser(ctx);
  return ok(getDB().addresses.filter((a) => a.userId === user.id));
});
route("POST /addresses", (ctx) => {
  const user = needUser(ctx);
  const db = getDB();
  const mine = db.addresses.filter((a) => a.userId === user.id);
  const row = { id: newId(), userId: user.id, country: "Nigeria", postalCode: null, latitude: null, longitude: null, ...ctx.body, isDefault: mine.length === 0 || !!ctx.body.isDefault, createdAt: now() };
  if (row.isDefault) mine.forEach((a) => (a.isDefault = false));
  db.addresses.push(row);
  return created(row, "Address saved");
});
route("PATCH /addresses/:id", (ctx) => {
  const user = needUser(ctx);
  const db = getDB();
  const row = db.addresses.find((a) => a.id === ctx.params.id && a.userId === user.id);
  if (!row) return fail(404, "Address not found.");
  if (ctx.body.isDefault) db.addresses.filter((a) => a.userId === user.id).forEach((a) => (a.isDefault = false));
  Object.assign(row, ctx.body);
  return ok(row, "Address updated");
});
route("DELETE /addresses/:id", (ctx) => {
  const user = needUser(ctx);
  const db = getDB();
  db.addresses = db.addresses.filter((a) => !(a.id === ctx.params.id && a.userId === user.id));
  return ok(null, "Address removed");
});

// ---- notifications ----
route("GET /notifications", (ctx) => {
  const user = needUser(ctx);
  const mine = getDB().notifications.filter((n) => n.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return ok(mine.slice(0, Number(ctx.query.limit) || 50));
});
route("PATCH /notifications/read-all", (ctx) => {
  const user = needUser(ctx);
  getDB().notifications.filter((n) => n.userId === user.id).forEach((n) => (n.isRead = true));
  return ok(null, "All read");
});
route("PATCH /notifications/:id/read", (ctx) => {
  const user = needUser(ctx);
  const n = getDB().notifications.find((x) => x.id === ctx.params.id && x.userId === user.id);
  if (n) n.isRead = true;
  return ok(n ?? null);
});
route("GET /notifications/preferences", (ctx) => {
  needUser(ctx);
  return ok(["ORDER", "SOCIAL", "MESSAGE", "SHOPPING", "SYSTEM"].map((type) => ({ type, inApp: true, email: true, push: false })));
});
route("PATCH /notifications/preferences", (ctx) => ok({ ...ctx.body }));

// ---- people ----
const publicProfile = (u: DemoUser, viewerId?: string) => {
  const db = getDB();
  const store = storeOfUser(db, u.id);
  return {
    ...miniUser(u),
    bio: u.bio,
    cover: u.cover ?? null,
    location: u.location ?? null,
    website: u.website ?? null,
    createdAt: u.createdAt,
    followersCount: db.follows.filter((f) => f.userId === u.id).length,
    followingCount: db.follows.filter((f) => f.followerId === u.id && f.userId).length,
    postsCount: db.posts.filter((p) => p.authorId === u.id && !p.isDeleted).length,
    isFollowing: !!viewerId && db.follows.some((f) => f.followerId === viewerId && f.userId === u.id),
    isMe: viewerId === u.id,
    store: store ? { id: store.id, name: store.name, slug: store.slug, logo: store.logo, isVerified: store.isVerified } : null,
    _count: { followers: db.follows.filter((f) => f.userId === u.id).length, following: db.follows.filter((f) => f.followerId === u.id && f.userId).length, posts: db.posts.filter((p) => p.authorId === u.id).length },
  };
};
const findUser = (identifier: string) => {
  const user = getDB().users.find((u) => u.id === identifier || u.username === identifier);
  if (!user) throw new DemoError(404, "User not found.");
  return user;
};
route("GET /users/suggested", ({ user, query }) => {
  const db = getDB();
  const following = new Set(db.follows.filter((f) => f.followerId === user?.id).map((f) => f.userId));
  return ok(
    db.users
      .filter((u) => u.id !== user?.id && u.role !== "ADMIN" && !following.has(u.id))
      .slice(0, Number(query.limit) || 6)
      .map((u) => ({ ...publicProfile(u, user?.id), mutualFollowers: 2, reason: storeOfUser(db, u.id) ? "Seller near you" : "Followed by friends" }))
  );
});
route("GET /users", ({ query, user }) => {
  const db = getDB();
  const q = (query.search ?? "").toLowerCase();
  return ok(paginate(db.users.filter((u) => u.role !== "ADMIN" && u.name.toLowerCase().includes(q)).map((u) => publicProfile(u, user?.id)), query, "users"));
});
route("GET /users/:id", ({ params, user }) => ok(publicProfile(findUser(params.id), user?.id)));

route("POST /follow/:userId", (ctx) => {
  const user = needUser(ctx);
  const db = getDB();
  const target = findUser(ctx.params.userId);
  if (!db.follows.some((f) => f.followerId === user.id && f.userId === target.id)) db.follows.push({ followerId: user.id, userId: target.id, createdAt: now() });
  return created({ id: target.id }, "Following");
});
route("DELETE /follow/:userId", (ctx) => {
  const user = needUser(ctx);
  const db = getDB();
  db.follows = db.follows.filter((f) => !(f.followerId === user.id && f.userId === ctx.params.userId));
  return ok(null, "Unfollowed");
});
route("GET /follow/:userId/status", ({ params, user }) => ok({ isFollowing: !!user && getDB().follows.some((f) => f.followerId === user.id && f.userId === params.userId), followsYou: !!user && getDB().follows.some((f) => f.userId === user.id && f.followerId === params.userId) }));
route("GET /follow/:userId/followers", ({ params, query, user }) => {
  const db = getDB();
  const ids = db.follows.filter((f) => f.userId === params.userId).map((f) => f.followerId);
  return ok(paginate(ids.map((id) => userById(db, id)).filter(Boolean).map((u) => publicProfile(u!, user?.id)), query, "followers"));
});
route("GET /follow/:userId/following", ({ params, query, user }) => {
  const db = getDB();
  const ids = db.follows.filter((f) => f.followerId === params.userId && f.userId).map((f) => f.userId);
  return ok(paginate(ids.map((id) => userById(db, id)).filter(Boolean).map((u) => publicProfile(u!, user?.id)), query, "following"));
});

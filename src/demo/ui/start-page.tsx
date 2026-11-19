"use client";

// The demo's front door: pick who to be. Animated stage with the Nestly
// cast, floating product cards and payment moments, then a card that grows
// into the app when you choose.

import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowRight, BadgeCheck, Gift, Lock, PackageCheck, Radio, ShieldCheck, Sparkles, Store } from "lucide-react";
import { useEffect, useState } from "react";

import { resetDB } from "../db";
import { hardNavigate } from "../navigate";
import { PERSONAS, setPersonaUserId, type PersonaKey } from "../persona";

const FLOATERS = [
  { img: "1578985545062-69928b1d9587", title: "Chocolate Drip Cake", price: "₦32,000", x: "6%", y: "16%", r: -8, d: 0 },
  { img: "1600185365483-26d7a4cc7519", title: "Cloud Runners", price: "₦38,000", x: "80%", y: "12%", r: 7, d: 0.6 },
  { img: "1571781926291-c477ebfd024b", title: "Glow Skincare Set", price: "₦32,000", x: "84%", y: "64%", r: -5, d: 1.2 },
  { img: "1505740420928-5e560c06d30e", title: "Studio Headphones", price: "₦65,000", x: "3%", y: "66%", r: 6, d: 1.8 },
];

const CHIPS = [
  { icon: Lock, text: "Paid · ₦32,000 held safely", x: "16%", y: "44%", d: 0.4, tone: "bg-emerald-400/15 text-emerald-200 ring-emerald-300/25" },
  { icon: PackageCheck, text: "Delivered with code 4 8 1 2 0 7", x: "70%", y: "40%", d: 1.4, tone: "bg-violet-400/15 text-violet-100 ring-violet-300/25" },
  { icon: Gift, text: "Tolu's gift · 69% chipped in", x: "62%", y: "86%", d: 2.2, tone: "bg-pink-400/15 text-pink-100 ring-pink-300/25" },
  { icon: Radio, text: "Bisi is live · 214 watching", x: "12%", y: "88%", d: 3, tone: "bg-rose-400/15 text-rose-100 ring-rose-300/25" },
];

const ORDER: PersonaKey[] = ["seller", "buyer", "admin"];
const ACCENT: Record<PersonaKey, string> = {
  seller: "from-amber-400 via-orange-500 to-fuchsia-600",
  buyer: "from-pink-400 via-fuchsia-500 to-violet-600",
  admin: "from-sky-400 via-indigo-500 to-violet-700",
};
const POINTS: Record<PersonaKey, string[]> = {
  seller: ["Open a shop in 2 minutes", "Payment links & offers in chat", "Sell live, get paid safely"],
  buyer: ["Shop trusted, verified sellers", "Pay safely, delivery codes", "Chip in on gifts with friends"],
  admin: ["Review new sellers", "Stop fraud, refund buyers", "See the marketplace grow"],
};

function PersonaCard({ k, index, onPick, picked }: { k: PersonaKey; index: number; onPick: (k: PersonaKey) => void; picked: PersonaKey | null }) {
  const p = PERSONAS[k];
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [8, -8]), { stiffness: 200, damping: 18 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-10, 10]), { stiffness: 200, damping: 18 });
  const fading = picked && picked !== k;

  return (
    <motion.button
      type="button"
      onClick={() => onPick(k)}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - rect.left) / rect.width - 0.5);
        my.set((e.clientY - rect.top) / rect.height - 0.5);
      }}
      onMouseLeave={() => {
        mx.set(0);
        my.set(0);
      }}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      initial={{ opacity: 0, y: 60, scale: 0.9 }}
      animate={fading ? { opacity: 0, scale: 0.85, y: 30 } : picked === k ? { scale: 1.06, y: -10 } : { opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: picked ? 0 : 0.5 + index * 0.15, type: "spring", stiffness: 160, damping: 18 }}
      whileHover={{ y: -8 }}
      whileTap={{ scale: 0.97 }}
      className="group relative flex w-full flex-col overflow-hidden rounded-[28px] bg-white/[0.06] p-5 text-left ring-1 ring-white/12 backdrop-blur-md sm:p-6"
    >
      <span className={`absolute inset-x-0 top-0 h-28 bg-gradient-to-br ${ACCENT[k]} opacity-90`} />
      <motion.span
        className="pointer-events-none absolute -right-4 top-1 h-40 w-32"
        animate={{ y: [0, -6, 0] }}
        transition={{ repeat: Infinity, duration: 3 + index * 0.4, ease: "easeInOut" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.avatar.replace(".svg", "-full.svg")} alt="" className="h-full w-full object-contain object-top drop-shadow-xl" />
      </motion.span>
      <span className="relative mt-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.28em] text-white/85">Play as</span>
      <span className="relative mt-1 font-[family-name:var(--font-fraunces)] text-[34px] leading-none text-white">{p.name}</span>
      <span className="relative mt-1.5 inline-flex w-fit rounded-full bg-black/25 px-2.5 py-1 text-[11.5px] font-semibold text-white">{p.role}</span>
      <span className="relative mt-12 text-[13.5px] leading-relaxed text-white/75">{p.blurb}</span>
      <ul className="relative mt-4 space-y-1.5">
        {POINTS[k].map((point) => (
          <li key={point} className="flex items-center gap-2 text-[12.5px] text-white/80">
            <BadgeCheck size={14} className="shrink-0 text-emerald-300" /> {point}
          </li>
        ))}
      </ul>
      <span className="relative mt-6 inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-white text-[14px] font-bold text-[#1f1640] transition-transform group-hover:translate-x-0.5">
        Start as {p.name} <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
      </span>
    </motion.button>
  );
}

export default function StartPage() {
  const [picked, setPicked] = useState<PersonaKey | null>(null);
  const [counter, setCounter] = useState(0);

  // A live counter, so the stage feels busy from the first second.
  useEffect(() => {
    const target = 1284;
    const timer = setInterval(() => setCounter((n) => (n >= target ? target : n + Math.ceil((target - n) / 12))), 40);
    return () => clearInterval(timer);
  }, []);

  const pick = (k: PersonaKey) => {
    if (picked) return;
    setPicked(k);
    setPersonaUserId(PERSONAS[k].userId);
    setTimeout(() => {
      // A full load, so the app starts signed in as this person.
      hardNavigate(PERSONAS[k].start);
    }, 900);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0d0a1f] text-white">
      {/* Background glow and dots */}
      <motion.div className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-violet-600/35 blur-[120px]" animate={{ x: [0, 60, 0], y: [0, 40, 0] }} transition={{ repeat: Infinity, duration: 14 }} />
      <motion.div className="pointer-events-none absolute -bottom-40 -right-32 h-[520px] w-[520px] rounded-full bg-fuchsia-600/25 blur-[120px]" animate={{ x: [0, -50, 0], y: [0, -30, 0] }} transition={{ repeat: Infinity, duration: 16 }} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(#fff_1.2px,transparent_1.2px)] [background-size:28px_28px]" />

      {/* Floating product cards (desktop) */}
      <div className="pointer-events-none absolute inset-0 hidden lg:block">
        {FLOATERS.map((f) => (
          <motion.div
            key={f.title}
            className="absolute w-44 overflow-hidden rounded-2xl bg-white text-[#1f1640] shadow-2xl"
            style={{ left: f.x, top: f.y, rotate: f.r }}
            initial={{ opacity: 0, scale: 0.6, y: 40 }}
            animate={{ opacity: picked ? 0 : 1, scale: 1, y: [0, -14, 0] }}
            transition={{ opacity: { delay: 0.3 + f.d * 0.3 }, scale: { delay: 0.3 + f.d * 0.3, type: "spring" }, y: { repeat: Infinity, duration: 5 + f.d, ease: "easeInOut" } }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://images.unsplash.com/photo-${f.img}?w=400&q=70&auto=format&fit=crop`} alt="" className="h-28 w-full object-cover" />
            <div className="p-2.5">
              <p className="truncate text-[12px] font-semibold">{f.title}</p>
              <p className="font-mono text-[12px] font-bold text-violet-700">{f.price}</p>
            </div>
          </motion.div>
        ))}
        {CHIPS.map((c) => (
          <motion.div
            key={c.text}
            className={`absolute flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-[12.5px] font-semibold ring-1 backdrop-blur ${c.tone}`}
            style={{ left: c.x, top: c.y }}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: picked ? 0 : [0, 1, 1, 0], scale: [0.7, 1, 1, 0.9] }}
            transition={{ delay: 1 + c.d, duration: 5, repeat: Infinity, repeatDelay: 2 }}
          >
            <c.icon size={14} /> {c.text}
          </motion.div>
        ))}
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-14 pt-10 sm:px-6 sm:pt-14">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="" className="h-9 w-9 rounded-xl" />
            <span className="font-[family-name:var(--font-fraunces)] text-[24px]">Nestly</span>
            <span className="rounded-full bg-amber-300/15 px-2.5 py-1 font-mono text-[10.5px] font-bold tracking-[0.2em] text-amber-200 ring-1 ring-amber-200/30">DEMO</span>
          </div>
          <button
            type="button"
            onClick={() => {
              resetDB();
              window.location.reload();
            }}
            className="whitespace-nowrap text-[12.5px] font-semibold text-white/55 hover:text-white"
          >
            Start the demo fresh
          </button>
        </motion.div>

        <div className="mx-auto mt-12 max-w-3xl text-center sm:mt-16">
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-3.5 py-1.5 text-[12.5px] font-semibold text-violet-100 ring-1 ring-white/10">
            <Sparkles size={14} className="text-amber-300" /> Try Nestly in your browser - no sign-up, nothing real
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 120 }}
            className="mt-5 font-[family-name:var(--font-fraunces)] text-[44px] leading-[1.02] tracking-tight sm:text-[64px]"
          >
            Sell and shop on social,
            <br />
            <span className="bg-gradient-to-r from-amber-200 via-fuchsia-300 to-violet-300 bg-clip-text italic text-transparent">without the fear.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="mx-auto mt-5 max-w-xl text-[15.5px] leading-relaxed text-white/65">
            Pick a role and walk through Nestly with our characters. Buy, sell, chip in and go live - every payment is pretend and nothing leaves your browser.
          </motion.p>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12.5px] text-white/55">
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-300" /> Money held until delivery
            </span>
            <span className="flex items-center gap-1.5">
              <Store size={14} className="text-amber-300" /> <span className="font-mono text-white/80">{counter.toLocaleString()}</span> shops on Nestly
            </span>
          </motion.div>
        </div>

        <div className="mx-auto mt-12 grid w-full max-w-5xl gap-4 sm:grid-cols-3 sm:gap-5">
          {ORDER.map((k, i) => (
            <PersonaCard key={k} k={k} index={i} onPick={pick} picked={picked} />
          ))}
        </div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }} className="mt-10 text-center text-[12px] text-white/40">
          Characters, shops and prices are made up. Your demo is saved in this browser until you reset it.
        </motion.p>
      </div>

      {/* The chosen card grows into the app */}
      <AnimatePresence>
        {picked && (
          <motion.div
            className={`fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br ${ACCENT[picked]}`}
            initial={{ clipPath: "circle(0% at 50% 60%)" }}
            animate={{ clipPath: "circle(150% at 50% 60%)" }}
            transition={{ duration: 0.8, ease: [0.65, 0, 0.35, 1] }}
          >
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.35 }} className="flex flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={PERSONAS[picked].avatar.replace(".svg", "-full.svg")} alt="" className="h-48 drop-shadow-2xl" />
              <p className="mt-2 font-[family-name:var(--font-fraunces)] text-[30px] text-white">Hi, I&apos;m {PERSONAS[picked].name}!</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

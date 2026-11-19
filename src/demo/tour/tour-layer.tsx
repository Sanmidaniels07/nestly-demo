"use client";

// Draws the active story: a dimmed screen with a moving spotlight on the
// element in play, a pulsing ring, and a speech bubble from the character
// telling the story. Also offers the stories when someone first arrives.

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Hand, Play, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { getPersonaUserId, PERSONAS, type PersonaKey } from "../persona";
import { findTarget, readTour, subscribeTour, writeTour, type CastKey, type Step } from "./engine";
import { STORIES, storyById } from "./stories";
import Confetti from "./confetti";

const NAMES: Record<CastKey, string> = { tola: "Tola", ada: "Ada", yusuf: "Yusuf", kunle: "Kunle", tolu: "Tolu", bisi: "Bisi" };
const PAD = 8;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const OFFER_KEY = "nestly-demo:offer-stories";

const useTour = () =>
  useSyncExternalStore(
    subscribeTour,
    () => {
      const t = readTour();
      return t ? `${t.storyId}:${t.step}` : "";
    },
    () => ""
  );

export default function TourLayer() {
  const router = useRouter();
  const tourKey = useTour();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  // Each is tied to the step it was measured for, so a new step starts clean.
  const [boxFor, setBoxFor] = useState<{ key: string; box: Box } | null>(null);
  const [readyKey, setReadyKey] = useState("");
  const [missingKey, setMissingKey] = useState("");
  const ready = !!tourKey && readyKey === tourKey;
  const box = boxFor && boxFor.key === tourKey ? boxFor.box : null;
  const missing = !!tourKey && missingKey === tourKey;
  const [celebrate, setCelebrate] = useState(0);
  const [offer, setOffer] = useState<PersonaKey | null>(null);
  const ranFor = useRef<string>("");
  const targetRef = useRef<HTMLElement | null>(null);

  const tour = tourKey ? readTour() : null;
  const story = tour ? storyById(tour.storyId) : null;
  const step: Step | null = story && tour ? story.steps[tour.step] ?? null : null;
  const isLast = !!story && !!tour && tour.step === story.steps.length - 1;

  // Offer the stories once, right after picking a character.
  useEffect(() => {
    try {
      const pending = localStorage.getItem(OFFER_KEY) as PersonaKey | null;
      if (pending && !readTour()) {
        // Cleared only when shown, so a re-run effect (React dev mode) still shows it.
        const timer = setTimeout(() => {
          localStorage.removeItem(OFFER_KEY);
          setOffer(pending);
        }, 1400);
        return () => clearTimeout(timer);
      }
    } catch {
      // ignore
    }
  }, []);

  const go = useCallback(
    (index: number) => {
      if (!story) return;
      if (index >= story.steps.length) {
        writeTour(null);
        return;
      }
      writeTour({ storyId: story.id, step: Math.max(0, index) });
    },
    [story]
  );

  // Start a step: open its page, run its action, then find its target.
  useEffect(() => {
    if (!step || !tour) return;
    const key = `${tour.storyId}:${tour.step}`;
    let cancelled = false;
    targetRef.current = null;
    (async () => {
      if (step.path) {
        const [path, search = ""] = step.path.split("?");
        if (window.location.pathname !== path || (search && window.location.search !== `?${search}`)) router.push(step.path);
      }
      if (ranFor.current !== key) {
        ranFor.current = key;
        await step.run?.();
      }
      await new Promise((r) => setTimeout(r, step.delay ?? 350));
      if (cancelled) return;
      if (step.celebrate) setCelebrate((n) => n + 1);
      setReadyKey(key);
    })();
    return () => {
      cancelled = true;
    };
  }, [tourKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the spotlight on its element as the page loads, scrolls and moves.
  useEffect(() => {
    if (!ready || !step?.target) return;
    let frame = 0;
    let scrolled = false;
    const started = Date.now();
    const tick = () => {
      const el = findTarget(step.target);
      if (el) {
        targetRef.current = el;
        if (!scrolled) {
          scrolled = true;
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        const r = el.getBoundingClientRect();
        setBoxFor((prev) =>
          prev && prev.key === tourKey && Math.abs(prev.box.x - r.left) < 1 && Math.abs(prev.box.y - r.top) < 1 && Math.abs(prev.box.w - r.width) < 1
            ? prev
            : { key: tourKey, box: { x: r.left, y: r.top, w: r.width, h: r.height } }
        );
        setMissingKey("");
      } else if (Date.now() - started > 7000) setMissingKey(tourKey);
      frame = window.setTimeout(tick, 120);
    };
    tick();
    return () => clearTimeout(frame);
  }, [ready, tourKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Advance when the spotlighted element is tapped, or when a condition is met.
  useEffect(() => {
    if (!ready || !step || !tour) return;
    if (step.advance === "click") {
      const onClick = (e: MouseEvent) => {
        const el = targetRef.current;
        if (el && e.target instanceof Node && el.contains(e.target)) setTimeout(() => go(tour.step + 1), 450);
      };
      document.addEventListener("click", onClick, true);
      return () => document.removeEventListener("click", onClick, true);
    }
    if (typeof step.advance === "function") {
      const check = step.advance;
      const timer = setInterval(() => {
        if (check()) {
          clearInterval(timer);
          go(tour.step + 1);
        }
      }, 300);
      return () => clearInterval(timer);
    }
  }, [ready, tourKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (id: string) => {
    setOffer(null);
    ranFor.current = "";
    writeTour({ storyId: id, step: 0 });
  };

  const who = step?.who ?? story?.who ?? "tola";
  const waitsForTap = step?.advance === "click" || typeof step?.advance === "function";
  const hole = box ? { x: box.x - PAD, y: box.y - PAD, w: box.w + PAD * 2, h: box.h + PAD * 2 } : null;

  // Bubble placement: below the target if there's room, else above; docked on phones.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const phone = vw < 640;
  const below = hole ? hole.y + hole.h + 260 < vh : true;
  const bubbleStyle: React.CSSProperties = phone || !hole
    ? {}
    : {
        left: Math.min(Math.max(16, hole.x + hole.w / 2 - 190), vw - 396),
        top: below ? hole.y + hole.h + 18 : undefined,
        bottom: below ? undefined : vh - hole.y + 18,
      };

  // On <body>, so no transformed ancestor can shift the fixed overlay.
  if (!mounted) return null;
  return createPortal(
    <div data-demo-tour>
      <Confetti fire={celebrate} />

      {/* Welcome: pick a story */}
      <AnimatePresence>
        {offer && (
          <motion.div className="fixed inset-0 z-[1100] flex items-end justify-center bg-[#0d0a1f]/55 p-3 backdrop-blur-[2px] sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              className="relative w-full max-w-md overflow-hidden rounded-[28px] bg-white text-[#1f1640] shadow-2xl dark:bg-[#17122f] dark:text-white"
              initial={{ y: 60, scale: 0.95, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", stiffness: 240, damping: 24 }}
            >
              <div className="relative h-32 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-amber-400">
                <motion.img
                  src={PERSONAS[offer].avatar.replace(".svg", "-full.svg")}
                  alt=""
                  className="absolute -bottom-6 right-5 h-40"
                  initial={{ y: 40, rotate: -6 }}
                  animate={{ y: [0, -6, 0], rotate: 0 }}
                  transition={{ y: { repeat: Infinity, duration: 2.6 }, rotate: { type: "spring" } }}
                />
                <p className="absolute left-5 top-5 font-mono text-[10.5px] font-bold uppercase tracking-[0.25em] text-white/85">Guided story</p>
                <p className="absolute left-5 top-11 max-w-[60%] font-[family-name:var(--font-fraunces)] text-[26px] leading-tight text-white">Want me to show you around?</p>
              </div>
              <div className="space-y-2.5 p-5">
                {STORIES.filter((s) => s.persona === offer).map((s) => (
                  <motion.button
                    key={s.id}
                    type="button"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => start(s.id)}
                    className="flex w-full items-center gap-3 rounded-2xl bg-violet-50 p-3.5 text-left ring-1 ring-violet-200 dark:bg-white/5 dark:ring-white/10"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white">
                      <Play size={18} className="translate-x-0.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14.5px] font-bold">{s.title}</span>
                      <span className="block text-[12.5px] leading-snug text-black/55 dark:text-white/60">{s.blurb}</span>
                    </span>
                    <span className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-white px-2 py-0.5 font-mono text-[10.5px] font-bold text-violet-700 dark:bg-white/10 dark:text-violet-200">{s.minutes} min</span>
                  </motion.button>
                ))}
                <button type="button" onClick={() => setOffer(null)} className="w-full whitespace-nowrap py-2 text-[13px] font-semibold text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white">
                  I&apos;ll explore on my own
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The active story */}
      <AnimatePresence>
        {step && ready && (
          <motion.div key="tour" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none fixed inset-0 z-[1050]">
            {/* Dim everything except the spotlight */}
            <svg className="absolute inset-0 h-full w-full">
              <defs>
                <mask id="demo-spot">
                  <rect width="100%" height="100%" fill="white" />
                  {hole && <motion.rect initial={false} animate={{ x: hole.x, y: hole.y, width: hole.w, height: hole.h }} transition={{ type: "spring", stiffness: 260, damping: 30 }} rx={16} fill="black" />}
                </mask>
              </defs>
              <rect width="100%" height="100%" fill="rgba(13,10,31,0.55)" mask="url(#demo-spot)" />
            </svg>

            {/* Clicks outside the spotlight are blocked while it waits for a tap */}
            {hole && waitsForTap && (
              <>
                <div className="pointer-events-auto absolute left-0 right-0 top-0" style={{ height: Math.max(0, hole.y) }} />
                <div className="pointer-events-auto absolute left-0 right-0 bottom-0" style={{ top: hole.y + hole.h }} />
                <div className="pointer-events-auto absolute left-0" style={{ top: hole.y, height: hole.h, width: Math.max(0, hole.x) }} />
                <div className="pointer-events-auto absolute right-0" style={{ top: hole.y, height: hole.h, left: hole.x + hole.w }} />
              </>
            )}

            {/* Pulsing ring + a hand nudging the tap */}
            {hole && (
              <motion.div className="absolute rounded-2xl" initial={false} animate={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }} transition={{ type: "spring", stiffness: 260, damping: 30 }}>
                <motion.span className="absolute inset-0 rounded-2xl ring-[3px] ring-amber-300" animate={{ opacity: [0.9, 0.3, 0.9], scale: [1, 1.04, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} />
                {step.advance === "click" && (
                  <motion.span className="absolute -bottom-7 right-2 text-amber-300 drop-shadow" animate={{ y: [0, -6, 0], rotate: [-8, 4, -8] }} transition={{ repeat: Infinity, duration: 1.2 }}>
                    <Hand size={26} fill="currentColor" />
                  </motion.span>
                )}
              </motion.div>
            )}

            {/* Speech bubble */}
            <motion.div
              key={tourKey}
              className={`pointer-events-auto absolute w-auto max-w-[380px] ${phone || !hole ? "bottom-[92px] left-3 right-3 mx-auto sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:w-[380px] sm:-translate-x-1/2 sm:-translate-y-1/2" : "w-[380px]"}`}
              style={bubbleStyle}
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
            >
              <div className="relative overflow-hidden rounded-3xl bg-white p-4 pl-[92px] text-[#1f1640] shadow-2xl ring-1 ring-black/5 dark:bg-[#17122f] dark:text-white dark:ring-white/10">
                <motion.img
                  src={`/demo/people/${who}-full.svg`}
                  alt=""
                  className="absolute -bottom-3 left-1 h-[118px]"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.2em] text-violet-600 dark:text-violet-300">{NAMES[who]}</p>
                  <button type="button" aria-label="End story" onClick={() => writeTour(null)} className="rounded-full p-1 text-black/35 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/10">
                    <X size={14} />
                  </button>
                </div>
                <p className="mt-0.5 text-[16px] font-bold leading-snug">{step.title}</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-black/65 dark:text-white/70">{missing ? `${step.body} (If you can't see it, tap Next.)` : step.body}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex gap-1">
                    {story!.steps.map((_, i) => (
                      <span key={i} className={`h-1.5 rounded-full transition-all ${i === tour!.step ? "w-5 bg-violet-600" : i < tour!.step ? "w-1.5 bg-violet-300" : "w-1.5 bg-black/10 dark:bg-white/15"}`} />
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {tour!.step > 0 && (
                      <button type="button" aria-label="Back" onClick={() => go(tour!.step - 1)} className="flex h-8 w-8 items-center justify-center rounded-full text-black/45 hover:bg-black/5 dark:text-white/50 dark:hover:bg-white/10">
                        <ArrowLeft size={15} />
                      </button>
                    )}
                    {(!waitsForTap || missing) && (
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={() => go(tour!.step + 1)}
                        className="flex h-8 items-center gap-1 whitespace-nowrap rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-3.5 text-[12.5px] font-bold text-white"
                      >
                        {isLast ? "Finish" : "Next"} <ArrowRight size={14} />
                      </motion.button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  );
}

export const offerStoriesFor = (persona: PersonaKey) => {
  try {
    localStorage.setItem(OFFER_KEY, persona);
  } catch {
    // ignore
  }
};

export const currentPersona = (): PersonaKey | null => {
  const id = getPersonaUserId();
  return (Object.keys(PERSONAS) as PersonaKey[]).find((k) => PERSONAS[k].userId === id) ?? null;
};

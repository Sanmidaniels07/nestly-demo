"use client";

// Always-there demo controls: a floating pill that opens a panel to switch
// character, reset the demo or go back to the start. Says plainly that
// nothing here is real.

import { AnimatePresence, motion } from "framer-motion";
import { ChevronUp, Home, Play, RotateCcw, Sparkles, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { resetDB } from "../db";
import { hardNavigate } from "../navigate";
import { getPersonaUserId, PERSONAS, setPersonaUserId, usePersonaChoices, type PersonaKey } from "../persona";
import { writeTour } from "../tour/engine";
import { STORIES } from "../tour/stories";
import TourLayer from "../tour/tour-layer";
import ActivityToasts from "./activity-toasts";

export default function DemoChrome() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const choices = usePersonaChoices();
  // Read from this browser; null while rendering on the server.
  const me = useSyncExternalStore(
    () => () => {},
    getPersonaUserId,
    () => null
  );

  if (pathname === "/") return null;
  // Pages with their own bar at the bottom (a collection's total and Check
  // out): sit above it so it stays readable.
  const raised = pathname.startsWith("/c/");
  const current = (Object.keys(PERSONAS) as PersonaKey[]).find((k) => PERSONAS[k].userId === me);

  const playStory = (id: string) => {
    const story = STORIES.find((s) => s.id === id)!;
    setOpen(false);
    writeTour({ storyId: id, step: 0 });
    // Another character's story: become them first.
    if (story.persona !== current) {
      setPersonaUserId(PERSONAS[story.persona].userId);
      hardNavigate(story.steps[0].path ?? PERSONAS[story.persona].start);
    }
  };

  const become = (k: PersonaKey) => {
    setPersonaUserId(PERSONAS[k].userId);
    hardNavigate(PERSONAS[k].start);
  };

  return (
    <>
    <TourLayer />
    <ActivityToasts />
    <div
      className={`pointer-events-none fixed left-3 z-[900] flex flex-col items-start sm:left-1/2 sm:-translate-x-1/2 sm:items-center ${
        raised ? "bottom-[180px] sm:bottom-28" : "bottom-[86px] sm:bottom-5"
      }`}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="pointer-events-auto mb-2 w-[290px] overflow-hidden rounded-3xl bg-[#140f2e] text-white shadow-2xl ring-1 ring-white/10"
          >
            <div className="flex items-start justify-between gap-3 bg-gradient-to-br from-violet-600 to-fuchsia-600 px-4 py-3.5">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-white/80">Nestly demo</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-white/90">Nothing here is real - no money moves and nothing leaves your browser.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-full p-1 text-white/80 hover:bg-white/15">
                <X size={15} />
              </button>
            </div>
            <div className="p-3">
              <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-white/45">Play as</p>
              <div className={`mt-2 grid gap-2 ${choices.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                {choices.map((k) => (
                  <motion.button
                    key={k}
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => become(k)}
                    className={`flex flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-[11.5px] font-semibold ring-1 transition-colors ${current === k ? "bg-white/12 ring-violet-300/60" : "ring-white/10 hover:bg-white/[0.06]"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={PERSONAS[k].avatar} alt="" className="h-10 w-10 rounded-full" />
                    {PERSONAS[k].name}
                    <span className="text-[10px] font-normal text-white/50">{PERSONAS[k].role}</span>
                  </motion.button>
                ))}
              </div>
              <p className="mt-4 px-1 text-[11px] font-semibold uppercase tracking-wider text-white/45">Guided stories</p>
              <div className="mt-2 space-y-1.5">
                {STORIES.filter((story) => choices.includes(story.persona)).map((story) => (
                  <button
                    key={story.id}
                    type="button"
                    onClick={() => playStory(story.id)}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-white/[0.06]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/demo/people/${story.who}.svg`} alt="" className="h-8 w-8 rounded-full" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold">{story.title}</span>
                      <span className="block text-[10.5px] text-white/45">{PERSONAS[story.persona].name} · {story.minutes} min</span>
                    </span>
                    <Play size={14} className="shrink-0 text-violet-300" />
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm("Start the demo fresh? Everything you did in it is cleared.")) return;
                    resetDB();
                    hardNavigate(current ? PERSONAS[current].start : "/");
                  }}
                  className="flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-white/[0.07] text-[12.5px] font-semibold hover:bg-white/12"
                >
                  <RotateCcw size={14} /> Reset demo
                </button>
                <button
                  type="button"
                  onClick={() => hardNavigate("/")}
                  className="flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-white/[0.07] text-[12.5px] font-semibold hover:bg-white/12"
                >
                  <Home size={14} /> Start screen
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.6, type: "spring" }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        className="pointer-events-auto flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-[#140f2e] pl-1.5 pr-3.5 text-[12.5px] font-semibold text-white shadow-xl shadow-violet-900/30 ring-1 ring-white/15"
      >
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={PERSONAS[current].avatar} alt="" className="h-7 w-7 rounded-full" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600">
            <Sparkles size={14} />
          </span>
        )}
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-300" />
        </span>
        Demo{current ? ` · ${PERSONAS[current].name}` : ""}
        <ChevronUp size={14} className={`transition-transform ${open ? "" : "rotate-180"}`} />
      </motion.button>
    </div>
    </>
  );
}

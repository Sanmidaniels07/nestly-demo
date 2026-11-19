"use client";

// A burst of confetti from the top of the screen. Re-fires when `fire` changes.

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const COLOURS = ["#7c3aed", "#f59e0b", "#10b981", "#ec4899", "#0ea5e9", "#f43f5e", "#a78bfa"];

export default function Confetti({ fire }: { fire: number }) {
  // The burst for `fire` shows until its timer marks it done.
  const [doneFor, setDoneFor] = useState(0);
  const burst = fire > 0 && doneFor !== fire ? fire : 0;

  useEffect(() => {
    if (!fire) return;
    const timer = setTimeout(() => setDoneFor(fire), 3200);
    return () => clearTimeout(timer);
  }, [fire]);

  return (
    <AnimatePresence>
      {burst > 0 && (
        <div key={burst} className="pointer-events-none fixed inset-0 z-[1200] overflow-hidden">
          {Array.from({ length: 70 }, (_, i) => {
            const left = (i * 37) % 100;
            const size = 6 + ((i * 13) % 8);
            const drift = ((i * 53) % 160) - 80;
            return (
              <motion.span
                key={i}
                className="absolute top-[-20px] block"
                style={{ left: `${left}%`, width: size, height: size * (i % 3 === 0 ? 2.2 : 1), background: COLOURS[i % COLOURS.length], borderRadius: i % 4 === 0 ? 999 : 2 }}
                initial={{ y: -20, x: 0, rotate: 0, opacity: 1 }}
                animate={{ y: typeof window !== "undefined" ? window.innerHeight + 40 : 900, x: drift, rotate: 360 + ((i * 47) % 360), opacity: [1, 1, 0.9, 0] }}
                transition={{ duration: 2.2 + ((i * 7) % 10) / 10, delay: ((i * 11) % 30) / 100, ease: [0.2, 0.6, 0.4, 1] }}
              />
            );
          })}
        </div>
      )}
    </AnimatePresence>
  );
}

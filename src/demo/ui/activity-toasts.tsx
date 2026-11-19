"use client";

// Live moments for whoever the visitor is playing: a new order, a payout,
// a delivery... slide in as animated cards when they happen in the demo.

import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCircle2, Gift, PackageCheck, ShoppingBag, Wallet } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { getPersonaUserId } from "../persona";

interface Card {
  id: string;
  title: string;
  message: string;
  type: string;
}

const iconFor = (card: Card) => {
  if (/order 🎉|new order/i.test(card.title)) return { icon: ShoppingBag, tone: "from-emerald-500 to-teal-500" };
  if (/deliver|✅/i.test(card.title)) return { icon: CheckCircle2, tone: "from-emerald-500 to-green-600" };
  if (/way|prepar/i.test(card.title)) return { icon: PackageCheck, tone: "from-sky-500 to-indigo-500" };
  if (/gift|chip/i.test(card.title + card.message)) return { icon: Gift, tone: "from-pink-500 to-fuchsia-600" };
  if (/payout|money|paid/i.test(card.title)) return { icon: Wallet, tone: "from-amber-400 to-orange-500" };
  return { icon: Bell, tone: "from-violet-600 to-indigo-600" };
};

export default function ActivityToasts() {
  const [cards, setCards] = useState<Card[]>([]);
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);

  useEffect(() => {
    const onNote = (e: Event) => {
      const detail = (e as CustomEvent).detail as Card & { userId: string };
      if (detail.userId !== getPersonaUserId()) return;
      setCards((list) => [{ id: detail.id, title: detail.title, message: detail.message, type: detail.type }, ...list].slice(0, 3));
      setTimeout(() => setCards((list) => list.filter((c) => c.id !== detail.id)), 6500);
    };
    window.addEventListener("nestly-demo:notification", onNote);
    return () => window.removeEventListener("nestly-demo:notification", onNote);
  }, []);

  if (!mounted) return null;
  return createPortal(
    <div className="pointer-events-none fixed right-3 top-[76px] z-[1150] flex w-[min(360px,calc(100vw-24px))] flex-col gap-2">
      <AnimatePresence initial={false}>
        {cards.map((card) => {
          const { icon: Icon, tone } = iconFor(card);
          return (
            <motion.div
              key={card.id}
              layout
              initial={{ opacity: 0, x: 60, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.92 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className="pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-2xl bg-white p-3.5 text-[#1f1640] shadow-xl ring-1 ring-black/5 dark:bg-[#17122f] dark:text-white dark:ring-white/10"
            >
              <motion.span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${tone} text-white`}
                initial={{ rotate: -20, scale: 0.6 }}
                animate={{ rotate: 0, scale: [0.6, 1.15, 1] }}
                transition={{ duration: 0.5 }}
              >
                <Icon size={19} />
              </motion.span>
              <div className="min-w-0">
                <p className="text-[13.5px] font-bold leading-snug">{card.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-black/60 dark:text-white/65">{card.message}</p>
              </div>
              <motion.span className="absolute bottom-0 left-0 h-[3px] bg-gradient-to-r from-violet-500 to-fuchsia-500" initial={{ width: "100%" }} animate={{ width: "0%" }} transition={{ duration: 6.5, ease: "linear" }} />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body
  );
}

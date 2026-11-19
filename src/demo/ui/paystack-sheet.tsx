"use client";

// The demo's stand-in for the Paystack popup: same moment in the flow, but
// nothing is charged. Card details type themselves in, then a big animated
// tick - so the "pay safely" step feels real in a demo.

import { AnimatePresence, motion } from "framer-motion";
import { Check, CreditCard, Landmark, Lock, ShieldCheck, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";

import { naira } from "../util";

type Stage = "form" | "paying" | "done";

const CARD = "4084 0840 8408 4081";

export default function PaystackSheet({
  amount,
  email,
  onPaid,
  onCancel,
}: {
  amount: number;
  email: string;
  onPaid: () => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [stage, setStage] = useState<Stage>("form");
  const [typed, setTyped] = useState(0);
  const [method, setMethod] = useState<"card" | "transfer" | "ussd">("card");

  // The test card types itself in, like a saved card autofilling.
  useEffect(() => {
    if (typed >= CARD.length) return;
    const timer = setTimeout(() => setTyped((n) => n + 1), typed === 0 ? 450 : 28);
    return () => clearTimeout(timer);
  }, [typed]);

  const pay = () => {
    setStage("paying");
    setTimeout(() => setStage("done"), 1400);
    setTimeout(() => setOpen(false), 2600);
  };

  return (
    <AnimatePresence onExitComplete={() => (stage === "done" ? onPaid() : onCancel())}>
      {open && (
        <motion.div
          key="backdrop"
          className="fixed inset-0 z-[1000] flex items-end justify-center bg-[#0d0a1f]/60 p-0 backdrop-blur-[3px] sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => stage === "form" && setOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-label="Demo payment"
            className="relative w-full max-w-[420px] overflow-hidden rounded-t-[28px] bg-white text-[#1f1640] shadow-2xl sm:rounded-[28px]"
            initial={{ y: 80, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-black/5 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0ba4db] text-white">
                  <Lock size={14} />
                </span>
                <div className="leading-tight">
                  <p className="text-[13px] font-bold">Secure checkout</p>
                  <p className="text-[11px] text-black/50">{email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-amber-700">DEMO</span>
                {stage === "form" && (
                  <button type="button" aria-label="Cancel payment" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-black/40 hover:bg-black/5 hover:text-black">
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="px-5 pb-6 pt-5">
              <p className="text-center text-[12px] font-medium uppercase tracking-[0.2em] text-black/45">You pay</p>
              <motion.p
                className="mt-1 text-center font-[family-name:var(--font-fraunces)] text-[40px] leading-none"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 300, damping: 18 }}
              >
                {naira(amount)}
              </motion.p>
              <p className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-emerald-700">
                <ShieldCheck size={14} /> Held safely by Nestly until you have your order
              </p>

              <AnimatePresence mode="wait">
                {stage === "form" && (
                  <motion.div key="form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mt-5">
                    <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-black/[0.04] p-1">
                      {[
                        { key: "card", icon: CreditCard, label: "Card" },
                        { key: "transfer", icon: Landmark, label: "Transfer" },
                        { key: "ussd", icon: Smartphone, label: "USSD" },
                      ].map(({ key, icon: Icon, label }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setMethod(key as typeof method)}
                          className={`relative flex h-10 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-semibold ${method === key ? "text-[#1f1640]" : "text-black/45"}`}
                        >
                          {method === key && <motion.span layoutId="pay-tab" className="absolute inset-0 rounded-xl bg-white shadow-sm" transition={{ type: "spring", stiffness: 400, damping: 30 }} />}
                          <Icon size={14} className="relative" />
                          <span className="relative">{label}</span>
                        </button>
                      ))}
                    </div>

                    {method === "card" ? (
                      <div className="mt-4 space-y-2.5">
                        <div className="rounded-2xl border border-black/10 px-4 py-2.5">
                          <p className="text-[11px] font-medium text-black/45">Card number</p>
                          <p className="font-mono text-[16px] tracking-wider">
                            {CARD.slice(0, typed)}
                            <motion.span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-violet-600" animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 0.9 }} />
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          <div className="rounded-2xl border border-black/10 px-4 py-2.5">
                            <p className="text-[11px] font-medium text-black/45">Expiry</p>
                            <p className="font-mono text-[15px]">12 / 30</p>
                          </div>
                          <div className="rounded-2xl border border-black/10 px-4 py-2.5">
                            <p className="text-[11px] font-medium text-black/45">CVV</p>
                            <p className="font-mono text-[15px]">•••</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-2xl border border-dashed border-black/15 px-4 py-5 text-center text-[13px] text-black/60">
                        {method === "transfer" ? "In the real app you'd get a one-time account number to transfer to." : "In the real app you'd dial a code from your bank."}
                        <br />
                        In the demo, just tap Pay.
                      </div>
                    )}

                    <motion.button
                      type="button"
                      onClick={pay}
                      whileTap={{ scale: 0.97 }}
                      className="mt-5 flex h-13 w-full items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-violet-500/30"
                    >
                      <Lock size={15} /> Pay {naira(amount)}
                    </motion.button>
                    <p className="mt-3 text-center text-[11px] text-black/40">Demo only - no card is charged and no money moves.</p>
                  </motion.div>
                )}

                {stage === "paying" && (
                  <motion.div key="paying" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center py-10">
                    <motion.span
                      className="h-14 w-14 rounded-full border-[5px] border-violet-200 border-t-violet-600"
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                    />
                    <p className="mt-4 text-[14px] font-semibold">Confirming your payment…</p>
                  </motion.div>
                )}

                {stage === "done" && (
                  <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-8">
                    <motion.span
                      className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/40"
                      initial={{ scale: 0 }}
                      animate={{ scale: [0, 1.15, 1] }}
                      transition={{ duration: 0.5 }}
                    >
                      <motion.span initial={{ pathLength: 0, rotate: -20 }} animate={{ pathLength: 1, rotate: 0 }} transition={{ delay: 0.2 }}>
                        <Check size={42} strokeWidth={3} />
                      </motion.span>
                    </motion.span>
                    {[...Array(10)].map((_, i) => (
                      <motion.span
                        key={i}
                        className="absolute h-2 w-2 rounded-full"
                        style={{ background: ["#7c3aed", "#f59e0b", "#10b981", "#ec4899", "#0ea5e9"][i % 5], top: "58%", left: "50%" }}
                        initial={{ x: 0, y: 0, opacity: 1 }}
                        animate={{ x: Math.cos((i / 10) * Math.PI * 2) * 120, y: Math.sin((i / 10) * Math.PI * 2) * 90, opacity: 0 }}
                        transition={{ duration: 0.9, ease: "easeOut" }}
                      />
                    ))}
                    <p className="mt-4 text-[17px] font-bold">Payment successful</p>
                    <p className="mt-1 text-[13px] text-black/55">Nestly is holding it safely.</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

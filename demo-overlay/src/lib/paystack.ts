// DEMO OVERLAY (replaces the website's lib/paystack.ts on sync).
// Opens the demo payment sheet instead of Paystack. Nothing is charged.

import { createElement } from "react";
import { createRoot } from "react-dom/client";

import { completePayment, paymentByCode } from "../demo/payments";
import PaystackSheet from "../demo/ui/paystack-sheet";

export const payWithPaystack = async (
  accessCode: string,
  handlers: {
    onSuccess: (reference: string) => void;
    onCancel: () => void;
    onError?: (message: string) => void;
  }
) => {
  const payment = paymentByCode(accessCode);
  if (!payment) {
    handlers.onError?.("This payment has expired. Please try again.");
    return;
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const close = () => {
    root.unmount();
    host.remove();
  };
  root.render(
    createElement(PaystackSheet, {
      amount: payment.amount,
      email: payment.email,
      onPaid: () => {
        // Same moment the real Paystack webhook would confirm it.
        completePayment(accessCode);
        close();
        handlers.onSuccess(payment.reference);
      },
      onCancel: () => {
        close();
        handlers.onCancel();
      },
    })
  );
};

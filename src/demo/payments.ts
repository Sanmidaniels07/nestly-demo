// Pretend Paystack. Starting a payment records what it's for; completing it
// in the demo payment sheet runs the same step Paystack's webhook would
// (mark the order paid, count the contribution, ...). No money moves.

import { getDB, saveDB, type DemoDB, type Row } from "./db";
import { newId, now } from "./util";

type Kind = "ORDER" | "CONTRIBUTION" | "GIFT";
const onPaid = new Map<Kind, (db: DemoDB, payment: Row) => void>();

export const whenPaid = (kind: Kind, handler: (db: DemoDB, payment: Row) => void) => onPaid.set(kind, handler);

export const startPayment = (db: DemoDB, kind: Kind, amount: number, email: string, data: Row, reference = `NESTLY_${newId().slice(-24)}`) => {
  const accessCode = `demo_${newId()}`;
  db.payments.push({ accessCode, reference, kind, amount, email, data, status: "PENDING", createdAt: now() });
  return { reference, accessCode, authorizationUrl: `/demo-pay/${accessCode}` };
};

export const paymentByCode = (accessCode: string) => getDB().payments.find((p) => p.accessCode === accessCode) ?? null;
export const paymentByReference = (reference: string) => getDB().payments.find((p) => p.reference === reference) ?? null;

/** Called by the demo payment sheet when the visitor taps Pay. */
export const completePayment = (accessCode: string) => {
  const db = getDB();
  const payment = db.payments.find((p) => p.accessCode === accessCode);
  if (!payment || payment.status === "SUCCESS") return payment;
  payment.status = "SUCCESS";
  payment.paidAt = now();
  onPaid.get(payment.kind)?.(db, payment);
  saveDB();
  return payment;
};

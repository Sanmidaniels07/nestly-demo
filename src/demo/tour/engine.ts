// Guided stories: a list of steps, each opening a page, spotlighting
// something and saying a line - or doing something in the demo world
// (a customer pays, a rider arrives). Progress is kept in this browser so a
// story carries on across page changes.

export type CastKey = "tola" | "ada" | "yusuf" | "kunle" | "tolu" | "bisi";

export interface Target {
  /** CSS selector of candidates (default: buttons, links and tabs). */
  selector?: string;
  /** Visible text the element must match. */
  text?: RegExp;
}

export interface Step {
  /** Open this page first (path + optional ?query). */
  path?: string;
  target?: Target;
  who?: CastKey;
  title: string;
  body: string;
  /** "next": a Next button (default). "click": tap the spotlighted element. A function: wait until it's true. */
  advance?: "next" | "click" | (() => boolean);
  /** Runs once when the step starts (demo-world actions). */
  run?: () => void | Promise<void>;
  celebrate?: boolean;
  /** Wait this long after `run` before showing the bubble (ms). */
  delay?: number;
}

export interface Story {
  id: string;
  persona: "buyer" | "seller" | "admin";
  title: string;
  blurb: string;
  minutes: number;
  who: CastKey;
  steps: Step[];
}

export interface TourState {
  storyId: string;
  step: number;
}

const KEY = "nestly-demo:tour";
const listeners = new Set<() => void>();

export const readTour = (): TourState | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
};

export const writeTour = (state: TourState | null) => {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
};

export const subscribeTour = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Finds the element a step points at: visible, matching, the tightest fit. */
export const findTarget = (target?: Target): HTMLElement | null => {
  if (!target) return null;
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(target.selector ?? "button, a, [role=tab], [role=button], label"));
  const visible = candidates.filter((el) => {
    if (el.closest("[data-demo-tour]")) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return false;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
    return !target.text || target.text.test((el.innerText || el.textContent || "").trim());
  });
  // What a visitor can actually tap: the element (or its child) is on top at
  // its centre - not hidden behind a sheet, banner or another copy of it.
  const onTop = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const x = Math.min(window.innerWidth - 1, Math.max(0, r.left + r.width / 2));
    const y = Math.min(window.innerHeight - 1, Math.max(0, r.top + r.height / 2));
    if (r.bottom < 0 || r.top > window.innerHeight) return true; // off screen: we scroll to it
    const hit = document.elementsFromPoint(x, y).find((node) => !(node as HTMLElement).closest("[data-demo-tour]"));
    return !!hit && (el === hit || el.contains(hit));
  };
  const area = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return r.width * r.height;
  };
  visible.sort((a, b) => Number(onTop(b)) - Number(onTop(a)) || area(a) - area(b));
  return visible[0] ?? null;
};

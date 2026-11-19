// DEMO OVERLAY (replaces the website's home page on sync): the demo's start screen.
import type { Metadata } from "next";

import StartPage from "../demo/ui/start-page";

export const metadata: Metadata = {
  title: { absolute: "Nestly demo - try it in your browser" },
  description: "Play as a seller, a shopper or the admin and see how Nestly works. No sign-up, nothing real.",
  robots: { index: false, follow: false },
};

export default function Home() {
  return <StartPage />;
}

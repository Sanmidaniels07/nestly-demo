// DEMO OVERLAY (replaces the website's lib/live-socket.ts on sync).
// Live chat, hearts, viewers and pins are simulated in the browser.

import { socketFor } from "../demo/fake-socket";
import type { Socket } from "socket.io-client";

export const getLiveSocket = () => socketFor("live") as unknown as Socket;

export const reconnectLiveSocket = () => {
  const socket = socketFor("live");
  socket.disconnect();
  socket.connect();
};

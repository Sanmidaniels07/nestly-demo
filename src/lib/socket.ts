// DEMO OVERLAY (replaces the website's lib/socket.ts on sync).
// Chat, presence and notifications come from the demo, not a server.

import { socketFor } from "../demo/fake-socket";
import type { Socket } from "socket.io-client";

export const getSocket = () => socketFor("main") as unknown as Socket;

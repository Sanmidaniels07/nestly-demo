/* eslint-disable @typescript-eslint/no-explicit-any */
// A stand-in for socket.io: the app subscribes to the same events, and the
// demo "server" (handlers, the activity simulator, simulated lives) pushes
// them from inside the browser.

type Listener = (...args: any[]) => void;

export class FakeSocket {
  id = `demo-${Math.random().toString(36).slice(2, 10)}`;
  connected = false;
  private listeners = new Map<string, Set<Listener>>();

  constructor(public namespace: string) {}

  on(event: string, listener: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }

  off(event: string, listener?: Listener) {
    if (!listener) this.listeners.delete(event);
    else this.listeners.get(event)?.delete(listener);
    return this;
  }

  once(event: string, listener: Listener) {
    const wrapped: Listener = (...args) => {
      this.off(event, wrapped);
      listener(...args);
    };
    return this.on(event, wrapped);
  }

  removeAllListeners() {
    this.listeners.clear();
    return this;
  }

  /** The app talking to the "server". Acks are answered by registered handlers. */
  emit(event: string, ...args: any[]) {
    const ack = typeof args[args.length - 1] === "function" ? (args.pop() as Listener) : null;
    const handler = clientHandlers.get(`${this.namespace}:${event}`);
    Promise.resolve(handler ? handler(this, ...args) : undefined).then((result) => ack?.(result ?? { ok: true }));
    return this;
  }

  connect() {
    if (this.connected) return this;
    this.connected = true;
    setTimeout(() => this.receive("connect"), 30);
    return this;
  }

  disconnect() {
    if (!this.connected) return this;
    this.connected = false;
    this.receive("disconnect", "io client disconnect");
    return this;
  }

  /** The "server" pushing an event to this client. */
  receive(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }
}

const sockets = new Map<string, FakeSocket>();
export const socketFor = (namespace: string) => {
  if (!sockets.has(namespace)) sockets.set(namespace, new FakeSocket(namespace));
  return sockets.get(namespace)!;
};

/** Push an event from the demo server to the app. */
export const serverPush = (namespace: string, event: string, ...args: any[]) => socketFor(namespace).receive(event, ...args);

const clientHandlers = new Map<string, (socket: FakeSocket, ...args: any[]) => unknown>();
/** Handle an event the app emits (e.g. "live:join"). */
export const onClientEmit = (namespace: string, event: string, handler: (socket: FakeSocket, ...args: any[]) => unknown) =>
  clientHandlers.set(`${namespace}:${event}`, handler);

// The code sandbox run for real in node: the iframe's relay in one node:vm context (standing in for the sandboxed
// document) and the worker's script in another (standing in for the blob: worker, named blob:null/… as in the
// browser), with the browser parts they use faked. Messages hop host → relay → worker and back asynchronously, as
// in the browser.
import vm from "node:vm";
import type { HostMessage, SandboxMessage } from "../shared/codeScene.ts";

type Listener = (e: unknown) => void;
const later = (fn: () => void) => setImmediate(fn);

export type Recorder = () => { ctx: unknown; ops: string[] };

export type BootedSandbox = {
  // What the relay sent the host (bitmaps dropped).
  posted: SandboxMessage[];
  // What the worker received from the relay (to check the token never reaches the code).
  toWorker: unknown[];
  send(data: HostMessage): void;
  drawn: string[][];
  // The relay's own global, and the worker's.
  relay: Record<string, unknown>;
  worker: Record<string, unknown>;
  // Whether the relay ran any of the person's code in its own document (it never should).
  workerStarted: boolean;
};

export async function bootSandbox(html: string, recorder: Recorder, opts: { crypto?: boolean } = {}): Promise<BootedSandbox> {
  const posted: SandboxMessage[] = [];
  const toWorker: unknown[] = [];
  const drawn: string[][] = [];
  const relayListeners: Record<string, Listener[]> = {};
  const parent = { postMessage: (m: SandboxMessage) => posted.push(JSON.parse(JSON.stringify({ ...m, bitmap: undefined }))) };
  const blobs = new Map<string, string>();
  let started = false;
  let workerGlobal: Record<string, unknown> = {};

  class OffscreenCanvas {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      const { ctx, ops } = recorder();
      drawn.push(ops);
      return ctx;
    }
    transferToImageBitmap() {
      return { close() {} };
    }
  }
  class Event {
    get timeStamp() {
      return 1234;
    }
  }

  class FakeWorker {
    private own: Record<string, Listener[]> = {};
    constructor(url: string) {
      const js = blobs.get(url);
      if (js === undefined) throw new Error("no such blob");
      started = true;
      const inside: Record<string, Listener[]> = {};
      const host = this;
      const global: Record<string, unknown> = {
        performance: { now: () => 0 },
        OffscreenCanvas,
        FontFace: class {},
        fonts: { add() {} },
        Event,
        ...(opts.crypto && { crypto: { getRandomValues: (a: Uint32Array) => a.fill(7), randomUUID: () => "uuid" } }),
        addEventListener: (type: string, fn: Listener) => (inside[type] ??= []).push(fn),
        postMessage: (data: unknown) => later(() => host.own.message?.forEach((fn) => fn({ data }))),
        console,
      };
      global.self = global;
      workerGlobal = global;
      this.deliver = (data: unknown) => later(() => inside.message?.forEach((fn) => fn({ data })));
      later(() => {
        const context = vm.createContext(global);
        try {
          vm.runInContext(js, context, { filename: "blob:null/test" });
        } catch (e) {
          const err = e as Error;
          const at = /blob:null\/test:(\d+)/.exec(String(err.stack));
          const event = { message: `Uncaught ${err.name}: ${err.message}`, lineno: at ? Number(at[1]) : 0, preventDefault() {} };
          inside.error?.forEach((fn) => fn(event));
          host.own.error?.forEach((fn) => fn(event));
        }
      });
    }
    private deliver: (data: unknown) => void;
    addEventListener(type: string, fn: Listener) {
      (this.own[type] ??= []).push(fn);
    }
    postMessage(data: unknown) {
      toWorker.push(data);
      this.deliver(data);
    }
  }

  const relay: Record<string, unknown> = {
    parent,
    Worker: FakeWorker,
    Blob: class {
      constructor(readonly parts: string[]) {}
    },
    URL: {
      createObjectURL: (b: { parts: string[] }) => {
        const url = `blob:null/${blobs.size}`;
        blobs.set(url, b.parts.join(""));
        return url;
      },
    },
    addEventListener: (type: string, fn: Listener) => (relayListeners[type] ??= []).push(fn),
    console,
  };
  relay.window = relay;
  const scripts = [...html.matchAll(/<script>\n?([\s\S]*?)\n?<\/script>/g)];
  const context = vm.createContext(relay);
  for (const m of scripts) vm.runInContext(m[1], context, { filename: "about:srcdoc" });
  await settle();
  return {
    posted,
    toWorker,
    send: (data) => relayListeners.message?.forEach((fn) => fn({ source: parent, data })),
    drawn,
    relay,
    get worker() {
      return workerGlobal;
    },
    get workerStarted() {
      return started;
    },
  };
}

// Lets every message hop (host → relay → worker → relay → host) and any font promise settle.
export async function settle() {
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
}

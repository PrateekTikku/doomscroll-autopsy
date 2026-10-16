import { browser, type Browser } from 'wxt/browser';

/**
 * Typed runtime messaging between extension contexts.
 *
 * Every message names its target context. Each context runs one router that only answers
 * messages addressed to it. Later milestones add message types by merging into `MessageMap`
 * from their own handler modules:
 *
 *   declare module '@/lib/messaging' {
 *     interface MessageMap { 'nudge-response': { request: {...}; response: void } }
 *   }
 */
export type Target = 'background' | 'offscreen' | 'content';

export interface MessageMap {
  ping: { request: void; response: { ok: true; from: Target } };
  'ping-offscreen': { request: void; response: { ok: boolean; offscreen: boolean; error?: string } };
}

export type MessageType = keyof MessageMap;
export type Request<K extends MessageType> = MessageMap[K]['request'];
export type Response<K extends MessageType> = MessageMap[K]['response'];

export interface Envelope<K extends MessageType = MessageType> {
  target: Target;
  type: K;
  payload: Request<K>;
}

type Reply<K extends MessageType> = { ok: true; data: Response<K> } | { ok: false; error: string };

export type Handler<K extends MessageType> = (
  payload: Request<K>,
  sender: Browser.runtime.MessageSender,
) => Response<K> | Promise<Response<K>>;

function isEnvelope(msg: unknown): msg is Envelope {
  return typeof msg === 'object' && msg !== null && 'target' in msg && 'type' in msg;
}

export function createRouter(target: Target) {
  const handlers = new Map<MessageType, Handler<any>>();

  function register<K extends MessageType>(type: K, handler: Handler<K>): void {
    if (handlers.has(type)) throw new Error(`Handler for "${type}" already registered in ${target}`);
    handlers.set(type, handler);
  }

  /** Returns a reply promise if this router owns the message, otherwise undefined. */
  function dispatch(msg: unknown, sender: Browser.runtime.MessageSender): Promise<Reply<any>> | undefined {
    if (!isEnvelope(msg) || msg.target !== target) return undefined;
    const handler = handlers.get(msg.type);
    if (!handler) return Promise.resolve({ ok: false, error: `No handler for "${msg.type}" in ${target}` });
    return Promise.resolve()
      .then(() => handler(msg.payload, sender))
      .then(
        (data) => ({ ok: true as const, data }),
        (err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }),
      );
  }

  /** Attach to `runtime.onMessage` (uses sendResponse + `return true`, which every Chrome supports). */
  function listen(): void {
    browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      const reply = dispatch(msg, sender);
      if (!reply) return false;
      reply.then(sendResponse);
      return true;
    });
  }

  return { register, dispatch, listen };
}

export async function send<K extends MessageType>(
  target: Target,
  type: K,
  ...payload: Request<K> extends void ? [] : [Request<K>]
): Promise<Response<K>> {
  const envelope: Envelope<K> = { target, type, payload: payload[0] as Request<K> };
  const reply = (await browser.runtime.sendMessage(envelope)) as Reply<K> | undefined;
  if (!reply) throw new Error(`No reply from ${target} for "${type}"`);
  if (!reply.ok) throw new Error(reply.error);
  return reply.data;
}

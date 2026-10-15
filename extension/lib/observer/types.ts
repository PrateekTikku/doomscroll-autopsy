import type { ObserverEvent } from '@shared/types';

/**
 * Inputs of the service-worker pipeline (lib/observer/pipeline.ts). This is also the line format
 * of the dev-mode recorder's JSONL (one event per line), which the replayer (M4) feeds back in.
 *
 * Observer events come from content scripts (shared/observer-event.schema.json) plus the sender's
 * tab id; browser events come from chrome.tabs / windows / idle and the service worker itself.
 * Item `text` is removed before an event reaches the pipeline or the recorder.
 */
export type TabObserverEvent = ObserverEvent & { tabId: number };

export type BrowserEvent =
  | { type: 'tab-activated'; ts: number; tabId: number; windowId: number }
  /** `windowId: null` means no Chrome window has focus (internal `away` state, D-45). */
  | { type: 'window-focus'; ts: number; windowId: number | null }
  | { type: 'idle-state'; ts: number; state: 'active' | 'idle' | 'locked' }
  | { type: 'tab-removed'; ts: number; tabId: number }
  /** Observation paused or resumed (PDD 11.3). While paused, nothing is counted. */
  | { type: 'pause'; ts: number; paused: boolean }
  /** Periodic clock tick (chrome.alarms); never recorded. */
  | { type: 'tick'; ts: number };

export type PipelineEvent = TabObserverEvent | BrowserEvent;

export function isObserverEvent(ev: PipelineEvent): ev is TabObserverEvent {
  return ev.type === 'item' || ev.type === 'scroll' || ev.type === 'video' || ev.type === 'visibility' || ev.type === 'heartbeat';
}

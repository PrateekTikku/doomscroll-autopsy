import { get, put } from '@/lib/db';

/** Counters for the "how often did the model's text pass?" numbers (M6 evidence), in `models/gen-stats`. */
export const GEN_STATS = 'gen-stats';

export interface TaskStats {
  /** Items written. */
  items: number;
  /** Items whose text came from the model after validation. */
  model: number;
  /** Items that fell back (baseline name / template). */
  fallback: number;
  /** Fallbacks because the model could not run at all. */
  unavailable: number;
  /** Generations run (retries included). */
  generations: number;
  /** How often each validator code refused a model output. */
  errors: Record<string, number>;
}

export interface GenStats {
  naming: TaskStats;
  autopsy: TaskStats;
}

const empty = (): TaskStats => ({ items: 0, model: 0, fallback: 0, unavailable: 0, generations: 0, errors: {} });
export const emptyStats = (): GenStats => ({ naming: empty(), autopsy: empty() });

export async function getGenStats(): Promise<GenStats> {
  return { ...emptyStats(), ...(((await get('models', GEN_STATS))?.data as Partial<GenStats> | undefined) ?? {}) };
}

export async function recordGen(task: keyof GenStats, delta: { model?: boolean; unavailable?: boolean; generations: number; errors: string[] }): Promise<void> {
  const stats = await getGenStats();
  const t = stats[task];
  t.items++;
  if (delta.model) t.model++;
  else t.fallback++;
  if (delta.unavailable) t.unavailable++;
  t.generations += delta.generations;
  for (const e of delta.errors) t.errors[e] = (t.errors[e] ?? 0) + 1;
  await put('models', { name: GEN_STATS, updatedAt: Date.now(), data: stats });
}

/** Fraction of items that fell back, or null with no items. */
export const fallbackRate = (t: TaskStats): number | null => (t.items ? Math.round((t.fallback / t.items) * 1000) / 1000 : null);

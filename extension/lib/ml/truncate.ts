/** Matryoshka truncation (PDD 8.3): keep the leading `dim` values and re-normalise to unit length. */
export function truncateAndNormalize(vec: ArrayLike<number>, dim: number): Float32Array | null {
  if (dim <= 0 || vec.length < dim) return null;
  const out = new Float32Array(dim);
  let sum = 0;
  for (let i = 0; i < dim; i++) {
    const v = vec[i]!;
    if (!Number.isFinite(v)) return null;
    out[i] = v;
    sum += v * v;
  }
  const norm = Math.sqrt(sum);
  if (norm === 0) return null;
  for (let i = 0; i < dim; i++) out[i]! /= norm;
  return out;
}

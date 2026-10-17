import pools from '../../scripts/demo/content.json';

/**
 * What each kind of page is about, as short phrases of page content (never of the user), in
 * `scripts/demo/content.json`. The demo-profile builder embeds these with the real EmbeddingGemma 2 and
 * gives every stored item a vector near one of its pool's phrases, so territories, topic tags and the
 * attention map come out of the real pipeline. A pool is deliberately varied for feeds (many topics in one
 * place) and focused for work pages.
 */
export const CONTENT = pools as Record<string, string[]>;

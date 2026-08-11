/**
 * Injection tokens for the memory infrastructure. Symbols, not strings, so two
 * modules cannot accidentally register the same token.
 */
export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');

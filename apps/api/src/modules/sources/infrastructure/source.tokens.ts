/**
 * Injection tokens for the source infrastructure. Symbols, not strings, so two
 * modules cannot accidentally register the same token.
 */
export const SAFE_HTTP_CLIENT = Symbol('SAFE_HTTP_CLIENT');
export const SOURCE_ADAPTERS = Symbol('SOURCE_ADAPTERS');

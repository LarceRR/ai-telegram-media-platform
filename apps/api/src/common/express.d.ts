/**
 * Correlation ID is attached to every inbound request by
 * CorrelationIdMiddleware. Declared as an ambient augmentation of the global
 * Express namespace, which @types/express-serve-static-core merges into.
 */
declare namespace Express {
  interface Request {
    correlationId?: string;
  }
}

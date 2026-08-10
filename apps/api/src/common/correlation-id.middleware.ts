import { Injectable, type NestMiddleware } from '@nestjs/common';
import { CORRELATION_ID_HEADER, resolveCorrelationId } from '@atmp/shared';
import type { NextFunction, Request, Response } from 'express';

/** Every request gets a correlation ID, echoed back for client-side tracing. */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId = resolveCorrelationId(req.headers[CORRELATION_ID_HEADER] as string);
    req.correlationId = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    next();
  }
}

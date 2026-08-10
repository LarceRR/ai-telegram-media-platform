import { Catch, HttpException, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { ApiError } from '@atmp/contracts';
import { AppError, newCorrelationId, toErrorCategory, type ErrorCategory, type Logger } from '@atmp/shared';
import type { Request, Response } from 'express';

const STATUS_BY_CATEGORY: Record<ErrorCategory, number> = {
  VALIDATION: HttpStatus.BAD_REQUEST,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  UPSTREAM_UNAVAILABLE: HttpStatus.BAD_GATEWAY,
  CONTRACT_VIOLATION: HttpStatus.UNPROCESSABLE_ENTITY,
  INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,
};

/** One consistent error envelope. Provider internals never leak to clients. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const correlationId = request.correlationId ?? newCorrelationId();

    let statusCode: number;
    let category: ErrorCategory;
    let message: string;
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      category = statusCode >= 500 ? 'INTERNAL' : 'VALIDATION';
      const payload = exception.getResponse();
      message = typeof payload === 'string' ? payload : exception.message;
      details = typeof payload === 'object' && payload !== null ? { ...payload } : undefined;
    } else if (exception instanceof AppError) {
      category = exception.category;
      statusCode = STATUS_BY_CATEGORY[category];
      message = exception.message;
      details = exception.details;
    } else {
      category = toErrorCategory(exception);
      statusCode = STATUS_BY_CATEGORY[category];
      message = statusCode >= 500 ? 'Internal server error' : String(exception);
    }

    const body: ApiError = {
      error: {
        category,
        message,
        statusCode,
        correlationId,
        path: request.originalUrl ?? request.url,
        timestamp: new Date().toISOString(),
        ...(details ? { details } : {}),
      },
    };

    const logPayload = { correlationId, statusCode, category, path: body.error.path, err: exception };
    if (statusCode >= 500) {
      this.logger.error(logPayload, 'request failed');
    } else {
      this.logger.warn(logPayload, 'request rejected');
    }

    response.status(statusCode).json(body);
  }
}

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'حدث خطأ غير متوقع، حاولي مرة أخرى',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        body = { code: `HTTP_${status}`, message: payload };
      } else if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        const message = record.message;

        body = {
          code: typeof record.code === 'string' ? record.code : `HTTP_${status}`,
          message: Array.isArray(message)
            ? message.join('، ')
            : typeof message === 'string'
              ? message
              : exception.message,
          details: Array.isArray(message) ? message : record.details,
        };
      }
    } else {
      // Never leak stack traces / internals to clients (see docs/SECURITY.md).
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.originalUrl}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      success: false,
      error: body,
      requestId: request.requestId ?? null,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    });
  }
}

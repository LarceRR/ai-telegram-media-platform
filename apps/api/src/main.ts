import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadEnv } from '@atmp/config';
import { CORRELATION_ID_HEADER, createLogger, registerGracefulShutdown } from '@atmp/shared';
import helmet from 'helmet';
import { AppModule } from './app/app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { PinoLoggerService } from './common/pino-logger.service';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger({
    service: 'api',
    level: env.LOG_LEVEL,
    pretty: env.NODE_ENV === 'development',
  });

  const app = await NestFactory.create(AppModule, {
    logger: new PinoLoggerService(logger),
    bufferLogs: true,
    cors: false,
  });

  app.use(helmet());
  app.enableCors({
    origin: env.CORS_ALLOWED_ORIGINS,
    credentials: true,
    allowedHeaders: ['content-type', 'authorization', CORRELATION_ID_HEADER],
    exposedHeaders: [CORRELATION_ID_HEADER],
  });
  app.setGlobalPrefix(env.API_GLOBAL_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter(logger));
  app.enableShutdownHooks();

  await app.listen(env.API_PORT, '0.0.0.0');

  registerGracefulShutdown({
    logger,
    timeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    tasks: [async () => app.close()],
  });

  logger.info(
    { port: env.API_PORT, prefix: env.API_GLOBAL_PREFIX, nodeEnv: env.NODE_ENV },
    'api process ready',
  );
}

void bootstrap();

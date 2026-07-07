import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Baseline input safety: whitelist DTO properties, reject unknown ones, and
  // transform payloads to their DTO types. Applied globally from day one so
  // every future write endpoint is guarded by default.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // OpenAPI document — the api is the single source of truth for the shared
  // DTO/type contract; the web repo codegens its types from this spec.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Coğrafya API')
    .setDescription('Backend API for the Coğrafya education platform.')
    .setVersion('0.0.1')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  // Surface boot failures (e.g. env validation) loudly and exit non-zero.
  console.error('Failed to bootstrap the application:', error);
  process.exit(1);
});

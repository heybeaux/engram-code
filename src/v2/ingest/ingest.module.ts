/**
 * NestJS module wiring for the EC-39 ingest flow.
 *
 * EC-47 adds the pass-run recorder so every synthesis pass driven by
 * `IngestService` writes a row to `pass_runs`. The recorder factory is
 * registered as a provider keyed on {@link INGEST_PASS_RUN_RECORDER} so
 * tests can override it by binding their own value to the same token.
 */

import { Module } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { IngestController } from './ingest.controller';
import {
  INGEST_BUDGET_PRISMA,
  INGEST_INCREMENTAL_PRISMA,
  INGEST_PASS_RUN_RECORDER,
  IngestService,
  makePrismaPassRunRecorder,
  type PassRunRecorder,
} from './ingest.service';

@Module({
  controllers: [IngestController],
  providers: [
    IngestService,
    {
      provide: INGEST_PASS_RUN_RECORDER,
      useFactory: (prisma: PrismaService): PassRunRecorder =>
        makePrismaPassRunRecorder(prisma, {
          error: (msg) => console.error(`[ingest pass-run] ${msg}`),
        }),
      inject: [PrismaService],
    },
    {
      provide: INGEST_BUDGET_PRISMA,
      useFactory: (prisma: PrismaService) => prisma,
      inject: [PrismaService],
    },
    {
      // EC-46: incremental rescans need the same Prisma client; bind it
      // under its own token so a deployer could swap in a read-replica.
      provide: INGEST_INCREMENTAL_PRISMA,
      useFactory: (prisma: PrismaService) => prisma,
      inject: [PrismaService],
    },
  ],
  exports: [IngestService],
})
export class V2IngestModule {}

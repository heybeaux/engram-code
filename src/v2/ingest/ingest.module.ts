/**
 * NestJS module wiring for the EC-39 ingest flow.
 */

import { Module } from '@nestjs/common';

import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';

@Module({
  controllers: [IngestController],
  providers: [IngestService],
  exports: [IngestService],
})
export class V2IngestModule {}

/**
 * NestJS module wiring for the v2 Cards API (EC-15).
 *
 * Kept deliberately bare — the controller is filesystem-only in Phase 1 and
 * has no injected dependencies. Phase 2 will add a Prisma-backed service
 * here for the database fast path.
 */

import { Module } from '@nestjs/common';

import { CardsController } from './cards.controller';

@Module({
  controllers: [CardsController],
})
export class CardsModule {}

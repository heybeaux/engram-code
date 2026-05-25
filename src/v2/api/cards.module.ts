/**
 * NestJS module wiring for the v2 API (EC-15 / EC-28).
 *
 * Phase 1 shipped a single read-only cards controller backed by the
 * filesystem. Phase 2 (EC-28) adds the map / search / subsystems endpoints
 * and the shared `CardsFsService` that all four controllers depend on.
 */

import { Module } from '@nestjs/common';

import { CardsController } from './cards.controller';
import { MapController } from './map.controller';
import { SearchConceptController } from './search.controller';
import { SubsystemsController } from './subsystems.controller';
import { CardsFsService } from './services/cards-fs.service';

@Module({
  controllers: [
    CardsController,
    MapController,
    SearchConceptController,
    SubsystemsController,
  ],
  providers: [CardsFsService],
})
export class CardsModule {}

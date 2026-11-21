// Module order for the deck. This is the single place to add/reorder modules.
// Hero + Yard release (release/hero-sombra): Video + gate are not shipped.

import { createHero } from "./modules/hero.js";
import { createYard } from "./modules/yard/index.js";

export const registry = [
  createHero(),
  createYard(),
];

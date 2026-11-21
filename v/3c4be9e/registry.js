// Module order for the deck. This is the single place to add/reorder modules.
// Minimal release (release/hero-sombra): Hero only. Yard + Video are not shipped.

import { createHero } from "./modules/hero.js";

export const registry = [
  createHero(),
];

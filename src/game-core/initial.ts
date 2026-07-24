import Decimal from 'break_infinity.js';
import { GENERATORS } from './data/generators';
import { recomputeDerived } from './derived';
import type { GameState } from './types';

/** 初回起動時の初期状態(GDD §11)。now は epoch ms */
export function createInitialState(now: number): GameState {
  return recomputeDerived({
    koban: new Decimal(0),
    lifetimeKoban: new Decimal(0),
    nekodama: new Decimal(0),
    generators: GENERATORS.map((g) => ({ id: g.id, owned: 0 })),
    upgrades: [],
    prestigeCount: 0,
    totalTaps: 0,
    startedAt: now,
    savedAt: now,
    derived: { prodPerSec: new Decimal(0), tapGain: new Decimal(0) },
  });
}

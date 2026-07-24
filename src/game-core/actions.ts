import Decimal from 'break_infinity.js';
import { GENERATORS } from './data/generators';
import { UPGRADES } from './data/upgrades';
import { generatorCost, nekodamaGain } from './formulas';
import { recomputeDerived } from './derived';
import type { GameState } from './types';

/**
 * 各アクションは純関数。失敗(買えない等)のときは同一参照を返すので、
 * 呼び出し側は参照比較で成否を判定できる。
 */

/**
 * 店員が解放済みか。直前の店員を1体以上所持で解放(GDD §4)。
 * masterIdx は GENERATORS 上の位置。state 側の参照は id で行い、
 * 順序ずれセーブが紛れても別スロットを壊さない。
 */
export function isGeneratorUnlocked(state: GameState, masterIdx: number): boolean {
  if (masterIdx <= 0) return true;
  const prevId = GENERATORS[masterIdx - 1].id;
  const prev = state.generators.find((g) => g.id === prevId);
  return (prev?.owned ?? 0) >= 1;
}

export function buyGenerator(state: GameState, id: string): GameState {
  const masterIdx = GENERATORS.findIndex((g) => g.id === id);
  if (masterIdx < 0 || !isGeneratorUnlocked(state, masterIdx)) return state;
  const stateIdx = state.generators.findIndex((g) => g.id === id);
  if (stateIdx < 0) return state;
  const owned = state.generators[stateIdx].owned;
  const cost = generatorCost(GENERATORS[masterIdx], owned);
  if (state.koban.lt(cost)) return state;
  const generators = state.generators.slice();
  generators[stateIdx] = { id, owned: owned + 1 };
  return recomputeDerived({
    ...state,
    koban: state.koban.sub(cost),
    generators,
  });
}

/** 未購入の先頭(=次に解放される強化)の id。全購入済みなら null */
export function nextUpgradeId(state: GameState): string | null {
  const next = UPGRADES.find((u) => !state.upgrades.includes(u.id));
  return next ? next.id : null;
}

export function buyUpgrade(state: GameState, id: string): GameState {
  // 配列順 = 解放順。前段未購入の強化は買えない(GDD §6)
  if (nextUpgradeId(state) !== id) return state;
  const def = UPGRADES.find((u) => u.id === id);
  if (!def || state.koban.lt(def.cost)) return state;
  return recomputeDerived({
    ...state,
    koban: state.koban.sub(def.cost),
    upgrades: [...state.upgrades, id],
  });
}

/**
 * 1タップ分の獲得。レート制限(15回/秒)は store 層の責務(TECH_DESIGN §7)。
 */
export function tap(state: GameState): GameState {
  const gain = state.derived.tapGain;
  return {
    ...state,
    koban: state.koban.add(gain),
    lifetimeKoban: state.lifetimeKoban.add(gain),
    totalTaps: state.totalTaps + 1,
  };
}

/** のれん分け。獲得予定が1個未満なら実行しない(GDD §8) */
export function prestige(state: GameState): GameState {
  const gain = nekodamaGain(state.lifetimeKoban, state.nekodama);
  if (gain.lt(1)) return state;
  return recomputeDerived({
    ...state,
    koban: new Decimal(0),
    nekodama: state.nekodama.add(gain),
    generators: GENERATORS.map((g) => ({ id: g.id, owned: 0 })),
    upgrades: [],
    prestigeCount: state.prestigeCount + 1,
    // lifetimeKoban / totalTaps / startedAt は保持(GDD §12)
  });
}

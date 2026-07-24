import Decimal from 'break_infinity.js';
import { GENERATORS } from './data/generators';
import { generatorProdPerSec, globalMult, tapGain, tapMult } from './formulas';
import type { GameState } from './types';

/**
 * 派生値(生産/秒・タップ収入)の再計算。
 * 呼び出し箇所は buy / buyUpgrade / prestige / ロード直後 / migrate 後に限定する
 * (TECH_DESIGN §5)。advance / tap は derived を読むだけ。
 */
export function recomputeDerived(state: GameState): GameState {
  const global = globalMult(state.nekodama);
  let prodPerSec = new Decimal(0);
  for (let i = 0; i < GENERATORS.length; i++) {
    prodPerSec = prodPerSec.add(
      generatorProdPerSec(GENERATORS[i], state.generators[i]?.owned ?? 0, global),
    );
  }
  return {
    ...state,
    derived: {
      prodPerSec,
      tapGain: tapGain(prodPerSec, global, tapMult(state.upgrades)),
    },
  };
}

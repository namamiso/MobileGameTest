import type { GameState } from './types';

/**
 * シミュレーションを dtSec 秒進める(純関数)。
 * 生産が 0 のときは同一参照を返す(構造共有。TECH_DESIGN §6)。
 * generators / upgrades などの参照は維持し、変化するフィールドだけ差し替える。
 *
 * 契約: dtSec は tick 級(1秒以下)を前提とする。長時間の経過を
 * ここに流すとオフライン規則(効率50%・8時間上限)を素通りするため、
 * 復帰処理は必ず applyOfflineProgress(offline.ts)を使うこと。
 * 例外: dev 限定の ?timescale= 加速はオフライン規則の素通りが目的どおりであり、
 * advance は dt に線形なので大きい dt でも安全。
 */
export function advance(state: GameState, dtSec: number): GameState {
  if (!Number.isFinite(dtSec) || dtSec <= 0) return state;
  const prod = state.derived.prodPerSec;
  if (prod.eq(0)) return state;
  const gain = prod.mul(dtSec);
  return {
    ...state,
    koban: state.koban.add(gain),
    lifetimeKoban: state.lifetimeKoban.add(gain),
  };
}

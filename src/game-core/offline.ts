import Decimal from 'break_infinity.js';
import type { GameState } from './types';

/** オフライン収益の上限(GDD §7) */
export const OFFLINE_MAX_SEC = 8 * 60 * 60;
/** オフライン中の生産効率(GDD §7) */
export const OFFLINE_EFFICIENCY = 0.5;
/** これ未満の非表示は「短時間離席」として効率100%・無音(GDD §7) */
export const OFFLINE_THRESHOLD_SEC = 60;

export type OfflineMode =
  /** 経過なし(未来 savedAt 含む) */
  | 'none'
  /** 60秒未満: 効率100%で無音加算 */
  | 'short'
  /** 60秒以上: クランプ→効率50%。獲得1以上でモーダル */
  | 'offline';

export interface OfflineResult {
  state: GameState;
  gained: Decimal;
  mode: OfflineMode;
  /** WelcomeBackModal を出すか(offline かつ獲得1小判以上) */
  showModal: boolean;
  /** 実際に収益へ換算した経過秒(クランプ後) */
  creditedSec: number;
}

/**
 * savedAt からの経過に応じてオフライン収益を一括適用する(純関数)。
 * 計算式: min(経過秒, 8時間) × 生産/秒 × 0.5 — クランプが先(GDD §7)。
 *
 * 時計改ざん対策: savedAt は単調非減少(max(savedAt, now))。
 * 巻き戻し(savedAt > now)時に savedAt を now へ戻すと、
 * 「時計を進める→収益取得→戻す→また進める」の往復で反復取得できてしまうため、
 * savedAt は据え置き、実時間が追いつくまで収益は発生しない(GDD §7)。
 * 呼び出し側は適用後 state を直ちに保存すること。
 */
export function applyOfflineProgress(state: GameState, nowMs: number): OfflineResult {
  // 非有限の now は savedAt を NaN/Infinity で汚染するため何もしない
  if (!Number.isFinite(nowMs)) {
    return { state, gained: new Decimal(0), mode: 'none', showModal: false, creditedSec: 0 };
  }
  const elapsedSec = Math.max(0, (nowMs - state.savedAt) / 1000);
  const prod = state.derived.prodPerSec;

  let mode: OfflineMode;
  let creditedSec: number;
  let gained: Decimal;
  if (elapsedSec <= 0) {
    mode = 'none';
    creditedSec = 0;
    gained = new Decimal(0);
  } else if (elapsedSec < OFFLINE_THRESHOLD_SEC) {
    mode = 'short';
    creditedSec = elapsedSec;
    gained = prod.mul(elapsedSec);
  } else {
    mode = 'offline';
    creditedSec = Math.min(elapsedSec, OFFLINE_MAX_SEC);
    gained = prod.mul(creditedSec).mul(OFFLINE_EFFICIENCY);
  }

  const newSavedAt = Math.max(state.savedAt, nowMs);
  const next: GameState = gained.gt(0)
    ? {
        ...state,
        koban: state.koban.add(gained),
        lifetimeKoban: state.lifetimeKoban.add(gained),
        savedAt: newSavedAt,
      }
    : { ...state, savedAt: newSavedAt };

  return {
    state: next,
    gained,
    mode,
    showModal: mode === 'offline' && gained.gte(1),
    creditedSec,
  };
}

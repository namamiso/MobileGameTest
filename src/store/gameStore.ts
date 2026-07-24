import type Decimal from 'break_infinity.js';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  buyGenerator as buyGeneratorAction,
  buyUpgrade as buyUpgradeAction,
  prestige as prestigeAction,
  tap as tapAction,
} from '@/game-core/actions';
import { advance } from '@/game-core/advance';
import { createInitialState } from '@/game-core/initial';
import type { OfflineResult } from '@/game-core/offline';
import type { GameState } from '@/game-core/types';

/** タップ収入の付与レート上限(GDD §5)。超過タップは演出のみ */
export const TAP_RATE_LIMIT_PER_SEC = 15;

export interface WelcomeBackInfo {
  gained: Decimal;
  creditedSec: number;
}

interface GameStore {
  state: GameState;
  /** loadGame 完了済みか(未完了の間はループ・UI を止める) */
  ready: boolean;
  /** アクティブタブロックの保持者か(TECH_DESIGN §8) */
  isLeader: boolean;
  /** セーブ破損で初期化したことの通知(GDD §11) */
  corruptNotice: boolean;
  welcomeBack: WelcomeBackInfo | null;

  initialize(state: GameState, corrupt: boolean, offline: OfflineResult | null): void;
  advanceBy(dtSec: number): void;
  /** 収入が付与されたら true(レート制限超過は false = 演出のみ) */
  tap(nowMs: number): boolean;
  buyGenerator(id: string): void;
  buyUpgrade(id: string): void;
  prestige(): void;
  /** タブ復帰時のオフライン適用結果を反映する */
  applyReturn(offline: OfflineResult): void;
  /**
   * savedAt の「収益計上済み透かし」を刻む。保存の成否とは独立に呼ぶ —
   * tick 収入は既にメモリに入っているため、透かしを進めないと
   * 復帰精算が同じ区間を二重加算する(議事録004)。
   */
  markSaved(nowMs: number): void;
  setLeader(isLeader: boolean): void;
  dismissWelcomeBack(): void;
  dismissCorruptNotice(): void;
  /** 全リセット等で state を丸ごと差し替える */
  replaceState(state: GameState): void;
}

/**
 * すべての更新は set(prev => …) の関数型アップデータで行う(TECH_DESIGN §6)。
 * zustand は同期実行のため、これで Pixi イベント発のアクションと tick の排他が成立する。
 */
export const useGameStore = create<GameStore>()(
  subscribeWithSelector((set, get) => {
    /**
     * レート制限用のタップ時刻窓。ストアと同寿命のクロージャ変数(保存されない)。
     * 時刻は performance.now 系のモノトニック値を渡すこと(壁時計だと
     * OS の時刻補正で窓が壊れる。TECH_DESIGN §4 の原則)。
     */
    let tapStamps: number[] = [];
    return {
    state: createInitialState(0),
    ready: false,
    isLeader: true,
    corruptNotice: false,
    welcomeBack: null,

    initialize: (state, corrupt, offline) =>
      set(() => ({
        state,
        ready: true,
        corruptNotice: corrupt,
        welcomeBack:
          offline && offline.showModal
            ? { gained: offline.gained, creditedSec: offline.creditedSec }
            : null,
      })),

    advanceBy: (dtSec) => set((prev) => ({ state: advance(prev.state, dtSec) })),

    tap: (nowMs) => {
      tapStamps = tapStamps.filter((t) => t > nowMs - 1000);
      if (tapStamps.length >= TAP_RATE_LIMIT_PER_SEC) return false;
      tapStamps.push(nowMs);
      set((prev) => ({ state: tapAction(prev.state) }));
      return true;
    },

    buyGenerator: (id) => set((prev) => ({ state: buyGeneratorAction(prev.state, id) })),
    buyUpgrade: (id) => set((prev) => ({ state: buyUpgradeAction(prev.state, id) })),
    prestige: () => set((prev) => ({ state: prestigeAction(prev.state) })),

    applyReturn: (offline) =>
      set((prev) => ({
        state: offline.state,
        welcomeBack: offline.showModal
          ? { gained: offline.gained, creditedSec: offline.creditedSec }
          : prev.welcomeBack,
      })),

    markSaved: (nowMs) =>
      set((prev) => ({
        state: { ...prev.state, savedAt: Math.max(prev.state.savedAt, nowMs) },
      })),

    setLeader: (isLeader) => {
      if (get().isLeader !== isLeader) set(() => ({ isLeader }));
    },

    dismissWelcomeBack: () => set(() => ({ welcomeBack: null })),
    dismissCorruptNotice: () => set(() => ({ corruptNotice: false })),
    replaceState: (state) => set(() => ({ state })),
    };
  }),
);

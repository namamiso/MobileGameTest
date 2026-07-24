'use client';

import { useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';
import { settleSuspendGap } from '@/store/session';

/** シミュレーション刻み(TECH_DESIGN §4) */
export const TICK_SEC = 0.1;
/** rAF 間欠(タブ復帰等)のスパイク上限。これを超える経過は精算経路が担う */
const MAX_ACC_SEC = 1;
/**
 * visibilitychange が発火しないまま rAF が止まった(蓋閉じ・サスペンド)と
 * みなす壁時計ギャップ。超えたら tick せず settleSuspendGap で精算する。
 */
const SUSPEND_GAP_SEC = 5;

/**
 * rAF + 固定タイムステップのゲームループ(TECH_DESIGN §4)。
 * enabled=false(未ロード・非リーダータブ)の間は回さない。
 * タブ復帰時は accumulator を捨てる — 非表示中の時間は
 * visibilitychange / settleSuspendGap 側で精算するため、
 * ここで追いつかせると二重加算になる。
 */
export function useGameLoop(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let last = performance.now();
    let lastWall = Date.now();
    let acc = 0;

    const frame = (now: number) => {
      const wallNow = Date.now();
      const wallGapSec = (wallNow - lastWall) / 1000;
      if (wallGapSec > SUSPEND_GAP_SEC) {
        // サスペンド検出: この区間は tick せずオフライン規則で精算
        settleSuspendGap(window.localStorage, lastWall, wallNow);
        acc = 0;
      } else {
        acc += (now - last) / 1000;
        acc = Math.min(acc, MAX_ACC_SEC);
        while (acc >= TICK_SEC) {
          useGameStore.getState().advanceBy(TICK_SEC);
          acc -= TICK_SEC;
        }
      }
      last = now;
      lastWall = wallNow;
      raf = requestAnimationFrame(frame);
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        last = performance.now();
        lastWall = Date.now();
        acc = 0;
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);
}

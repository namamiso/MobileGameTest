import { applyOfflineProgress } from '@/game-core/offline';
import { createInitialState } from '@/game-core/initial';
import { useGameStore } from './gameStore';
import { clearSave, loadGame, peekGame, saveGame, type StorageLike } from './persistence';
import { releaseLock, tryAcquireLock } from './tabLock';

/**
 * セッション配線の本体(TECH_DESIGN §4, §8, §9)。
 * GameRoot はイベント・タイマーをここへ委譲するだけにし、
 * ロジックはすべて storage と時刻を注入して vitest で検証する。
 *
 * 原則(議事録004):
 * - savedAt は「収益計上済み透かし」。markSaved は保存成否と無関係に刻む
 * - 精算(applyOfflineProgress)と保存はリーダーのみ
 * - ロック取得 → ロード の順(取得前に書かない)
 */

/** 起動。ロックを取ってからロードする。2回目以降の呼び出し(StrictMode)は再初期化しない */
export function bootSession(storage: StorageLike, tabId: string, now: number): void {
  const leader = tryAcquireLock(storage, tabId, now);
  const store = useGameStore.getState();
  if (!store.ready) {
    if (leader) {
      const loaded = loadGame(storage, now);
      store.initialize(loaded.state, loaded.corrupt, loaded.offline);
      // オフライン適用後は直ちに保存(GDD §7)。透かしは成否に関わらず刻む
      saveGame(storage, loaded.state, now);
      useGameStore.getState().markSaved(now);
    } else {
      // 非リーダーは精算なしの表示用ロード。精算・保存は昇格時に行う
      const peeked = peekGame(storage, now);
      store.initialize(peeked.state, peeked.corrupt, null);
    }
  }
  useGameStore.getState().setLeader(leader);
}

/**
 * ハートビート(2秒ごと+lock キーの storage イベント)。
 * 非リーダー → リーダーへ昇格したときはディスクのセーブから再同期する —
 * 凍結中の古い in-memory state で再開すると旧リーダーの進捗を巻き戻すため
 * (TECH_DESIGN §8)。
 */
export function heartbeatTick(storage: StorageLike, tabId: string, now: number): void {
  const store = useGameStore.getState();
  const wasLeader = store.isLeader;
  const leader = tryAcquireLock(storage, tabId, now);
  if (leader && !wasLeader && store.ready) {
    const loaded = loadGame(storage, now);
    store.initialize(loaded.state, loaded.corrupt, loaded.offline);
    saveGame(storage, loaded.state, now);
    useGameStore.getState().markSaved(now);
  }
  useGameStore.getState().setLeader(leader);
}

/** autosave(10秒ごと)。hidden 中は禁止 — savedAt が前進すると放置収益が全損する */
export function autosaveTick(storage: StorageLike, now: number, hidden: boolean): void {
  const store = useGameStore.getState();
  if (!store.ready || !store.isLeader || hidden) return;
  saveGame(storage, store.state, now);
  store.markSaved(now);
}

/** visibilitychange: hidden 側。保存し、成否に関わらず透かしを刻む */
export function handleHidden(storage: StorageLike, now: number): void {
  const store = useGameStore.getState();
  if (!store.ready) return;
  if (store.isLeader) saveGame(storage, store.state, now);
  store.markSaved(now);
}

/**
 * visibilitychange: visible 側。非表示中の経過を精算する
 * (60秒未満は無音100%、以上は50%+モーダル。GDD §7)。
 * 呼び出し前に heartbeatTick でリーダー状態を確定させること(stale リーダー対策)。
 */
export function handleVisible(storage: StorageLike, now: number): void {
  const store = useGameStore.getState();
  if (!store.ready || !store.isLeader) return;
  const result = applyOfflineProgress(store.state, now);
  store.applyReturn(result);
  saveGame(storage, result.state, now);
  useGameStore.getState().markSaved(now);
}

/**
 * rAF が visibilitychange なしに長時間止まった場合(ノートPCの蓋閉じ等)の精算。
 * ループが壁時計ギャップを検出したときに呼ぶ。基準は「最後にフレームが動いた時刻」
 * (それ以前は tick が計上済み)と透かしの新しい方。
 */
export function settleSuspendGap(storage: StorageLike, prevWallMs: number, now: number): void {
  const store = useGameStore.getState();
  if (!store.ready || !store.isLeader) return;
  const base = Math.max(store.state.savedAt, prevWallMs);
  const result = applyOfflineProgress({ ...store.state, savedAt: base }, now);
  store.applyReturn(result);
  saveGame(storage, result.state, now);
  useGameStore.getState().markSaved(now);
}

/** 他タブがセーブを更新した(storage イベント)。非リーダーは表示を追従させる */
export function handleExternalSaveChange(storage: StorageLike, now: number): void {
  const store = useGameStore.getState();
  if (!store.ready || store.isLeader) return;
  const peeked = peekGame(storage, now);
  if (!peeked.corrupt) store.replaceState(peeked.state);
}

/** タブ閉鎖(pagehide)。最終保存してロックを手放す */
export function handlePageHide(storage: StorageLike, tabId: string, now: number): void {
  const store = useGameStore.getState();
  if (store.ready && store.isLeader) {
    saveGame(storage, store.state, now);
    store.markSaved(now);
  }
  releaseLock(storage, tabId);
}

/** 手動の全リセット(GDD §11) */
export function resetSession(storage: StorageLike, now: number): void {
  const store = useGameStore.getState();
  clearSave(storage);
  store.replaceState(createInitialState(now));
  saveGame(storage, useGameStore.getState().state, now);
}

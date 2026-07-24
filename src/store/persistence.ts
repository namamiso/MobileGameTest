import { createInitialState } from '@/game-core/initial';
import { applyOfflineProgress, type OfflineResult } from '@/game-core/offline';
import { migrate } from '@/game-core/save/migrate';
import { deserialize, serialize } from '@/game-core/save/serialize';
import type { GameState } from '@/game-core/types';

export const SAVE_KEY = 'nekochaya:save';
/** 破損セーブの退避先(復旧調査用。GDD §11) */
export const CORRUPT_BACKUP_KEY = 'nekochaya:save:corrupt-backup';

/** localStorage 互換の注入点(テストではインメモリ実装を渡す) */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PeekResult {
  state: GameState;
  /** 破損を検出して初期化した(元データは退避済み) */
  corrupt: boolean;
}

export interface LoadResult extends PeekResult {
  /** セーブが存在した場合のオフライン適用結果。初回起動は null */
  offline: OfflineResult | null;
}

/**
 * オフライン精算なしの読み込み。非リーダータブの表示用
 * (精算・保存はリーダーだけの権限。TECH_DESIGN §8)。
 * 破損(parse不能・version不正)は元文字列を退避してから初期化。
 */
export function peekGame(storage: StorageLike, now: number): PeekResult & { existed: boolean } {
  let raw: string | null = null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    raw = null;
  }
  if (raw === null) {
    return { state: createInitialState(now), corrupt: false, existed: false };
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const save = parsed === null ? null : migrate(parsed);
  if (save === null) {
    try {
      storage.setItem(CORRUPT_BACKUP_KEY, raw);
      storage.removeItem(SAVE_KEY);
    } catch {
      // 退避すら失敗しても初期化は続行する
    }
    return { state: createInitialState(now), corrupt: true, existed: true };
  }

  return { state: deserialize(save, now), corrupt: false, existed: true };
}

/**
 * 起動フロー(TECH_DESIGN §9)。リーダータブ専用:
 * セーブなし → 初期状態(オフライン計算なし)。
 * セーブあり → migrate → deserialize → applyOfflineProgress。
 */
export function loadGame(storage: StorageLike, now: number): LoadResult {
  const peeked = peekGame(storage, now);
  if (!peeked.existed || peeked.corrupt) {
    return { state: peeked.state, corrupt: peeked.corrupt, offline: null };
  }
  const offline = applyOfflineProgress(peeked.state, now);
  return { state: offline.state, corrupt: false, offline };
}

/**
 * 保存。savedAt は serialize が max(state.savedAt, now) でスタンプする。
 * 既存セーブが自分の透かし(state.savedAt)より新しい場合は上書きしない —
 * 比較に now を混ぜると stale なタブでも常に「自分が新しい」ことになり
 * ガードが無効化されるため、透かし同士で比較する(TECH_DESIGN §8)。
 * 戻り値は実際に書き込んだかどうか。
 */
export function saveGame(storage: StorageLike, state: GameState, now: number): boolean {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (raw !== null) {
      try {
        const existing = JSON.parse(raw) as { savedAt?: unknown };
        if (typeof existing.savedAt === 'number' && existing.savedAt > state.savedAt) {
          return false;
        }
      } catch {
        // 既存が壊れているなら上書きして良い
      }
    }
    storage.setItem(SAVE_KEY, JSON.stringify(serialize(state, now)));
    return true;
  } catch {
    return false;
  }
}

/** 手動リセット(GDD §11)。退避バックアップも消す */
export function clearSave(storage: StorageLike): void {
  try {
    storage.removeItem(SAVE_KEY);
    storage.removeItem(CORRUPT_BACKUP_KEY);
  } catch {
    // 消せない環境では何もしない
  }
}

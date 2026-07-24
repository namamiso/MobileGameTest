import type { StorageLike } from './persistence';

export const LOCK_KEY = 'nekochaya:tab-lock';
/** リーダーがロックを更新する間隔 */
export const HEARTBEAT_MS = 2_000;
/** これより古いロックは死んだタブとみなす */
export const STALE_MS = 5_000;

interface LockRecord {
  id: string;
  t: number;
}

function readLock(storage: StorageLike): LockRecord | null {
  try {
    const raw = storage.getItem(LOCK_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<LockRecord>;
    if (typeof parsed.id !== 'string' || typeof parsed.t !== 'number') return null;
    return { id: parsed.id, t: parsed.t };
  } catch {
    return null;
  }
}

/**
 * アクティブタブロックの取得を試みる(TECH_DESIGN §8)。
 * ロックが不在・自分のもの・期限切れ(STALE_MS 超)なら取得してハートビートを書き、
 * true を返す。他タブの生きたロックがあれば false。
 * HEARTBEAT_MS ごと+ storage イベントで呼び直すこと。
 */
export function tryAcquireLock(storage: StorageLike, tabId: string, now: number): boolean {
  const lock = readLock(storage);
  const isMine = lock !== null && lock.id === tabId;
  const isStale = lock !== null && now - lock.t > STALE_MS;
  if (lock !== null && !isMine && !isStale) return false;
  try {
    storage.setItem(LOCK_KEY, JSON.stringify({ id: tabId, t: now } satisfies LockRecord));
    // check-then-set は非アトミックなので、書いた直後に読み戻して勝者を確定する
    // (同時起動の二重リーダー窓を 2 秒 → ほぼゼロに縮める)
    const verify = readLock(storage);
    return verify !== null && verify.id === tabId;
  } catch {
    return false;
  }
}

/** 自分が保持しているロックだけを解放する(タブ終了時) */
export function releaseLock(storage: StorageLike, tabId: string): void {
  const lock = readLock(storage);
  if (lock !== null && lock.id === tabId) {
    try {
      storage.removeItem(LOCK_KEY);
    } catch {
      // 失敗しても STALE_MS 経過で他タブが取得できる
    }
  }
}

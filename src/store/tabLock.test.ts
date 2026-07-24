import { describe, expect, it } from 'vitest';
import type { StorageLike } from './persistence';
import { HEARTBEAT_MS, LOCK_KEY, releaseLock, STALE_MS, tryAcquireLock } from './tabLock';

const NOW = 1_700_000_000_000;

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('tryAcquireLock', () => {
  it('acquires when no lock exists', () => {
    const storage = memoryStorage();
    expect(tryAcquireLock(storage, 'tab-a', NOW)).toBe(true);
    expect(storage.data.has(LOCK_KEY)).toBe(true);
  });

  it('second tab is rejected while the lock is fresh', () => {
    const storage = memoryStorage();
    tryAcquireLock(storage, 'tab-a', NOW);
    expect(tryAcquireLock(storage, 'tab-b', NOW + HEARTBEAT_MS)).toBe(false);
  });

  it('own lock is refreshed (heartbeat)', () => {
    const storage = memoryStorage();
    tryAcquireLock(storage, 'tab-a', NOW);
    expect(tryAcquireLock(storage, 'tab-a', NOW + HEARTBEAT_MS)).toBe(true);
    const lock = JSON.parse(storage.data.get(LOCK_KEY)!) as { t: number };
    expect(lock.t).toBe(NOW + HEARTBEAT_MS);
  });

  it('another tab takes over a stale lock', () => {
    const storage = memoryStorage();
    tryAcquireLock(storage, 'tab-a', NOW);
    expect(tryAcquireLock(storage, 'tab-b', NOW + STALE_MS)).toBe(false); // ちょうどはまだ有効
    expect(tryAcquireLock(storage, 'tab-b', NOW + STALE_MS + 1)).toBe(true);
    const lock = JSON.parse(storage.data.get(LOCK_KEY)!) as { id: string };
    expect(lock.id).toBe('tab-b');
  });

  it('acquires over a malformed lock record', () => {
    const storage = memoryStorage();
    storage.setItem(LOCK_KEY, 'not json');
    expect(tryAcquireLock(storage, 'tab-a', NOW)).toBe(true);
  });
});

describe('releaseLock', () => {
  it('removes only its own lock', () => {
    const storage = memoryStorage();
    tryAcquireLock(storage, 'tab-a', NOW);
    releaseLock(storage, 'tab-b'); // 他人のロックは消さない
    expect(storage.data.has(LOCK_KEY)).toBe(true);
    releaseLock(storage, 'tab-a');
    expect(storage.data.has(LOCK_KEY)).toBe(false);
  });
});

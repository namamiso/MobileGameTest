import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { buyGenerator } from '@/game-core/actions';
import { createInitialState } from '@/game-core/initial';
import { serialize } from '@/game-core/save/serialize';
import {
  clearSave,
  CORRUPT_BACKUP_KEY,
  loadGame,
  SAVE_KEY,
  saveGame,
  type StorageLike,
} from './persistence';

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

function playedState(now: number) {
  let s = createInitialState(now);
  s = { ...s, koban: new Decimal(1_000), lifetimeKoban: new Decimal(1_000) };
  s = buyGenerator(s, 'koneko');
  return s;
}

describe('loadGame', () => {
  it('first launch: initial state, no offline, no corrupt flag', () => {
    const r = loadGame(memoryStorage(), NOW);
    expect(r.corrupt).toBe(false);
    expect(r.offline).toBeNull();
    expect(r.state.koban.eq(0)).toBe(true);
    expect(r.state.savedAt).toBe(NOW);
  });

  it('restores a save and applies offline progress from savedAt', () => {
    const storage = memoryStorage();
    const s = playedState(NOW - 3600_000); // 1時間前に保存
    storage.setItem(SAVE_KEY, JSON.stringify(serialize(s, NOW - 3600_000)));
    const r = loadGame(storage, NOW);
    expect(r.corrupt).toBe(false);
    expect(r.offline).not.toBeNull();
    expect(r.offline!.mode).toBe('offline');
    // 0.1/秒 × 3600秒 × 0.5 = 180
    expect(r.offline!.gained.eq(180)).toBe(true);
    expect(r.state.koban.sub(s.koban).eq(180)).toBe(true);
    expect(r.state.savedAt).toBe(NOW);
  });

  it('corrupt JSON: backs up raw, clears save, returns initial state', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, '{broken json');
    const r = loadGame(storage, NOW);
    expect(r.corrupt).toBe(true);
    expect(r.state.koban.eq(0)).toBe(true);
    expect(storage.data.get(CORRUPT_BACKUP_KEY)).toBe('{broken json');
    expect(storage.data.has(SAVE_KEY)).toBe(false);
  });

  it('future save version is treated as corrupt', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 99, koban: '5' }));
    const r = loadGame(storage, NOW);
    expect(r.corrupt).toBe(true);
    expect(storage.data.has(CORRUPT_BACKUP_KEY)).toBe(true);
  });
});

describe('saveGame', () => {
  it('writes a save stamped with the save time', () => {
    const storage = memoryStorage();
    const s = playedState(NOW - 5_000);
    expect(saveGame(storage, s, NOW)).toBe(true);
    const written = JSON.parse(storage.data.get(SAVE_KEY)!) as { savedAt: number };
    expect(written.savedAt).toBe(NOW);
  });

  it('refuses to overwrite a newer save from another tab', () => {
    const storage = memoryStorage();
    const other = playedState(NOW);
    storage.setItem(SAVE_KEY, JSON.stringify(serialize(other, NOW + 60_000))); // 未来=より新しい
    const mine = playedState(NOW - 10_000);
    expect(saveGame(storage, mine, NOW)).toBe(false);
    const kept = JSON.parse(storage.data.get(SAVE_KEY)!) as { savedAt: number };
    expect(kept.savedAt).toBe(NOW + 60_000);
  });

  it('refuses when existing is newer than our watermark, even with a current clock', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify(serialize(playedState(NOW - 5_000), NOW - 5_000)));
    const stale = playedState(NOW - 10_000); // 透かしが既存より古い stale タブ
    expect(saveGame(storage, stale, NOW)).toBe(false);
  });

  it('returns false when the storage write throws (quota)', () => {
    const storage = memoryStorage();
    const failing = {
      getItem: storage.getItem,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: storage.removeItem,
    };
    expect(saveGame(failing, playedState(NOW), NOW)).toBe(false);
  });

  it('overwrites a corrupt existing save', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, 'garbage');
    expect(saveGame(storage, playedState(NOW), NOW)).toBe(true);
    expect(() => JSON.parse(storage.data.get(SAVE_KEY)!)).not.toThrow();
  });

  it('round-trips through loadGame', () => {
    const storage = memoryStorage();
    const s = playedState(NOW);
    saveGame(storage, s, NOW);
    const r = loadGame(storage, NOW + 1_000); // 1秒後(short 区間、精算は100%)
    expect(r.corrupt).toBe(false);
    expect(r.state.generators[0].owned).toBe(1);
    // 1秒 × 0.1/秒 × 100%
    expect(r.state.koban.sub(s.koban).toNumber()).toBeCloseTo(0.1, 10);
  });
});

describe('clearSave', () => {
  it('removes save and corrupt backup', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, 'a');
    storage.setItem(CORRUPT_BACKUP_KEY, 'b');
    clearSave(storage);
    expect(storage.data.size).toBe(0);
  });
});

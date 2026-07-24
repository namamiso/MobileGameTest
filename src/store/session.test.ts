import Decimal from 'break_infinity.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { buyGenerator } from '@/game-core/actions';
import { createInitialState } from '@/game-core/initial';
import { serialize } from '@/game-core/save/serialize';
import { useGameStore } from './gameStore';
import { SAVE_KEY, type StorageLike } from './persistence';
import {
  autosaveTick,
  bootSession,
  handleExternalSaveChange,
  handleHidden,
  handleVisible,
  heartbeatTick,
  settleSuspendGap,
} from './session';
import { STALE_MS, tryAcquireLock } from './tabLock';

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

/** 1時間前に保存された「生産1.1/秒」のセーブを storage に用意する */
function seedSave(storage: StorageLike, savedAt: number) {
  let s = createInitialState(savedAt);
  s = { ...s, koban: new Decimal(1_000), lifetimeKoban: new Decimal(1_000) };
  s = buyGenerator(s, 'koneko');
  s = buyGenerator(s, 'chahakobi');
  storage.setItem(SAVE_KEY, JSON.stringify(serialize(s, savedAt)));
  return s;
}

function storedSavedAt(storage: StorageLike): number {
  return (JSON.parse(storage.getItem(SAVE_KEY)!) as { savedAt: number }).savedAt;
}

beforeEach(() => {
  useGameStore.setState({
    state: createInitialState(0),
    ready: false,
    isLeader: true,
    corruptNotice: false,
    welcomeBack: null,
  });
});

describe('bootSession', () => {
  it('leader boot: loads, settles offline, saves immediately', () => {
    const storage = memoryStorage();
    const before = seedSave(storage, NOW - 3600_000);
    bootSession(storage, 'tab-a', NOW);
    const s = useGameStore.getState();
    expect(s.ready).toBe(true);
    expect(s.isLeader).toBe(true);
    // 1時間 × 1.1/秒 × 50% = 1980
    expect(s.state.koban.sub(before.koban).eq(1980)).toBe(true);
    expect(s.welcomeBack).not.toBeNull();
    expect(storedSavedAt(storage)).toBe(NOW);
    expect(s.state.savedAt).toBe(NOW);
  });

  it('second boot call (StrictMode) keeps welcomeBack and state', () => {
    const storage = memoryStorage();
    seedSave(storage, NOW - 3600_000);
    bootSession(storage, 'tab-a', NOW);
    const koban = useGameStore.getState().state.koban;
    bootSession(storage, 'tab-a', NOW + 50);
    const s = useGameStore.getState();
    expect(s.welcomeBack).not.toBeNull(); // 2回目で消えない
    expect(s.state.koban.eq(koban)).toBe(true); // 二重精算しない
  });

  it('non-leader boot: loads for display WITHOUT settling or saving', () => {
    const storage = memoryStorage();
    const before = seedSave(storage, NOW - 3600_000);
    tryAcquireLock(storage, 'other-tab', NOW - 1_000); // 他タブが生きたロック保持
    bootSession(storage, 'tab-b', NOW);
    const s = useGameStore.getState();
    expect(s.isLeader).toBe(false);
    expect(s.state.koban.eq(before.koban)).toBe(true); // 精算なし
    expect(storedSavedAt(storage)).toBe(NOW - 3600_000); // 保存もしない
  });
});

describe('heartbeatTick (leader promotion)', () => {
  it('promotion reloads from disk instead of resuming frozen state', () => {
    const storage = memoryStorage();
    seedSave(storage, NOW - 3600_000);
    tryAcquireLock(storage, 'old-leader', NOW - 1_000);
    bootSession(storage, 'tab-b', NOW); // 非リーダーで凍結
    const frozen = useGameStore.getState().state;

    // 旧リーダーが進捗を保存してから死ぬ
    const progressed = { ...frozen, koban: frozen.koban.add(999_999) };
    storage.setItem(SAVE_KEY, JSON.stringify(serialize(progressed, NOW + 1_000)));

    const later = NOW + 1_000 + STALE_MS + 1; // ロックが stale になった後
    heartbeatTick(storage, 'tab-b', later);
    const s = useGameStore.getState();
    expect(s.isLeader).toBe(true);
    // 凍結 state ではなくディスクの進捗から再開している(巻き戻さない)
    expect(s.state.koban.gte(progressed.koban)).toBe(true);
    expect(storedSavedAt(storage)).toBe(later);
  });
});

describe('autosaveTick', () => {
  it('does nothing while hidden (savedAt must not advance)', () => {
    const storage = memoryStorage();
    seedSave(storage, NOW - 3600_000);
    bootSession(storage, 'tab-a', NOW);
    autosaveTick(storage, NOW + 120_000, true); // hidden
    expect(storedSavedAt(storage)).toBe(NOW); // 前進していない
    expect(useGameStore.getState().state.savedAt).toBe(NOW);
  });

  it('saves and advances the watermark when visible leader', () => {
    const storage = memoryStorage();
    seedSave(storage, NOW - 3600_000);
    bootSession(storage, 'tab-a', NOW);
    autosaveTick(storage, NOW + 10_000, false);
    expect(storedSavedAt(storage)).toBe(NOW + 10_000);
    expect(useGameStore.getState().state.savedAt).toBe(NOW + 10_000);
  });
});

describe('handleHidden / handleVisible', () => {
  it('hidden stamps the watermark even if the save write fails', () => {
    const storage = memoryStorage();
    seedSave(storage, NOW - 3600_000);
    bootSession(storage, 'tab-a', NOW);
    const failing: StorageLike = {
      getItem: storage.getItem,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: storage.removeItem,
    };
    handleHidden(failing, NOW + 30_000);
    // 保存は失敗しても透かしは進む(オンライン計上済み区間の二重加算防止)
    expect(useGameStore.getState().state.savedAt).toBe(NOW + 30_000);
  });

  it('visible after 2 minutes hidden: 50% settlement with modal', () => {
    const storage = memoryStorage();
    seedSave(storage, NOW - 3600_000);
    bootSession(storage, 'tab-a', NOW);
    useGameStore.getState().dismissWelcomeBack();
    handleHidden(storage, NOW + 10_000);
    const kobanAtHidden = useGameStore.getState().state.koban;

    const back = NOW + 10_000 + 120_000;
    handleVisible(storage, back);
    const s = useGameStore.getState();
    // 120秒 × 1.1/秒 × 50% = 66
    expect(s.state.koban.sub(kobanAtHidden).eq(66)).toBe(true);
    expect(s.welcomeBack).not.toBeNull();
    expect(s.state.savedAt).toBe(back);
    expect(storedSavedAt(storage)).toBe(back);
  });

  it('visible after 30s hidden: silent 100% settlement', () => {
    const storage = memoryStorage();
    seedSave(storage, NOW - 3600_000);
    bootSession(storage, 'tab-a', NOW);
    useGameStore.getState().dismissWelcomeBack();
    handleHidden(storage, NOW + 10_000);
    const kobanAtHidden = useGameStore.getState().state.koban;

    handleVisible(storage, NOW + 40_000);
    const s = useGameStore.getState();
    // 30秒 × 1.1/秒 × 100% = 33
    expect(s.state.koban.sub(kobanAtHidden).eq(33)).toBe(true);
    expect(s.welcomeBack).toBeNull();
  });

  it('non-leader visible does not settle', () => {
    const storage = memoryStorage();
    const before = seedSave(storage, NOW - 3600_000);
    tryAcquireLock(storage, 'other-tab', NOW - 1_000);
    bootSession(storage, 'tab-b', NOW);
    handleVisible(storage, NOW + 3600_000);
    expect(useGameStore.getState().state.koban.eq(before.koban)).toBe(true);
  });
});

describe('settleSuspendGap', () => {
  it('credits only the frozen gap, from the last live frame', () => {
    const storage = memoryStorage();
    seedSave(storage, NOW - 3600_000);
    bootSession(storage, 'tab-a', NOW);
    const kobanBefore = useGameStore.getState().state.koban;

    // 透かしは NOW のまま、最後のフレームは NOW+9秒(tick計上済み)、
    // そこから30秒サスペンドした想定
    settleSuspendGap(storage, NOW + 9_000, NOW + 39_000);
    const s = useGameStore.getState();
    // 30秒 × 1.1/秒 × 100%(short)= 33。tick済みの9秒分は含まない
    expect(s.state.koban.sub(kobanBefore).eq(33)).toBe(true);
    expect(s.state.savedAt).toBe(NOW + 39_000);
  });
});

describe('handleExternalSaveChange', () => {
  it('non-leader follows another tab\'s save', () => {
    const storage = memoryStorage();
    seedSave(storage, NOW - 3600_000);
    tryAcquireLock(storage, 'other-tab', NOW - 1_000);
    bootSession(storage, 'tab-b', NOW);

    const richer = { ...useGameStore.getState().state, koban: new Decimal('777777') };
    storage.setItem(SAVE_KEY, JSON.stringify(serialize(richer, NOW + 5_000)));
    handleExternalSaveChange(storage, NOW + 5_000);
    expect(useGameStore.getState().state.koban.eq('777777')).toBe(true);
  });

  it('leader ignores external save events', () => {
    const storage = memoryStorage();
    seedSave(storage, NOW - 3600_000);
    bootSession(storage, 'tab-a', NOW);
    const koban = useGameStore.getState().state.koban;
    storage.setItem(SAVE_KEY, JSON.stringify(serialize(createInitialState(NOW), NOW + 5_000)));
    handleExternalSaveChange(storage, NOW + 5_000);
    expect(useGameStore.getState().state.koban.eq(koban)).toBe(true);
  });
});

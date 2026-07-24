import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { buyGenerator } from './actions';
import { createInitialState } from './initial';
import {
  applyOfflineProgress,
  OFFLINE_EFFICIENCY,
  OFFLINE_MAX_SEC,
  OFFLINE_THRESHOLD_SEC,
} from './offline';
import type { GameState } from './types';

const BASE = 1_700_000_000_000;

/** 生産 1/秒(茶運び1体)を持つ state。savedAt = BASE */
function producingState(): GameState {
  let s = createInitialState(BASE);
  s = { ...s, koban: new Decimal(1_000) };
  s = buyGenerator(s, 'koneko'); // 解放用
  // 生産をきりの良い値にするため茶運び(1/秒)を1体
  s = buyGenerator(s, 'chahakobi');
  return s;
}

describe('applyOfflineProgress', () => {
  it('short absence (<60s): 100% efficiency, silent', () => {
    const s = producingState();
    const prod = s.derived.prodPerSec; // 1.1/秒
    const r = applyOfflineProgress(s, BASE + 59_000);
    expect(r.mode).toBe('short');
    expect(r.showModal).toBe(false);
    expect(r.gained.eq(prod.mul(59))).toBe(true);
    expect(r.state.koban.sub(s.koban).eq(r.gained)).toBe(true);
    expect(r.state.savedAt).toBe(BASE + 59_000);
  });

  it('offline (>=60s): 50% efficiency with modal', () => {
    const s = producingState();
    const prod = s.derived.prodPerSec;
    const r = applyOfflineProgress(s, BASE + 60_000);
    expect(r.mode).toBe('offline');
    expect(r.gained.eq(prod.mul(OFFLINE_THRESHOLD_SEC).mul(OFFLINE_EFFICIENCY))).toBe(true);
    expect(r.showModal).toBe(true);
    expect(r.state.savedAt).toBe(BASE + 60_000);
  });

  it('elapsed exactly 0: mode none', () => {
    const s = producingState();
    const r = applyOfflineProgress(s, BASE);
    expect(r.mode).toBe('none');
    expect(r.gained.eq(0)).toBe(true);
  });

  it('non-finite now: state untouched (same reference)', () => {
    const s = producingState();
    expect(applyOfflineProgress(s, NaN).state).toBe(s);
    expect(applyOfflineProgress(s, Infinity).state).toBe(s);
  });

  it('offline gain below 1 koban: silently credited, no modal', () => {
    const base = producingState();
    // 二進で正確な 1/64 /秒 → 64秒 × 0.5 = 獲得0.5(厳密)
    const s: GameState = {
      ...base,
      derived: { ...base.derived, prodPerSec: new Decimal(1 / 64) },
    };
    const r = applyOfflineProgress(s, BASE + 64_000);
    expect(r.mode).toBe('offline');
    expect(r.gained.eq(0.5)).toBe(true);
    expect(r.showModal).toBe(false);
    expect(r.state.koban.sub(s.koban).eq(r.gained)).toBe(true);
  });

  it('modal shows at exactly 1 koban gained', () => {
    const base = producingState();
    // 1/32 /秒 × 64秒 × 0.5 = 獲得ちょうど1(厳密)
    const s: GameState = {
      ...base,
      derived: { ...base.derived, prodPerSec: new Decimal(1 / 32) },
    };
    const r = applyOfflineProgress(s, BASE + 64_000);
    expect(r.gained.eq(1)).toBe(true);
    expect(r.showModal).toBe(true);
  });

  it('shares unchanged references (structural sharing)', () => {
    const s = producingState();
    const gained = applyOfflineProgress(s, BASE + 3600_000);
    expect(gained.state.generators).toBe(s.generators);
    expect(gained.state.upgrades).toBe(s.upgrades);
    expect(gained.state.derived).toBe(s.derived);
    const zero = applyOfflineProgress(createInitialState(BASE), BASE + 3600_000);
    expect(zero.state.generators).toBe(zero.state.generators);
  });

  it('clamps elapsed to 8h BEFORE applying the 50% factor', () => {
    const s = producingState();
    const prod = s.derived.prodPerSec;
    const r = applyOfflineProgress(s, BASE + 16 * 3600 * 1000); // 16時間
    // min(16h, 8h) × prod × 0.5 —「50%後に8h上限」だと prod×8h になるので区別できる
    expect(r.creditedSec).toBe(OFFLINE_MAX_SEC);
    expect(r.gained.eq(prod.mul(OFFLINE_MAX_SEC).mul(OFFLINE_EFFICIENCY))).toBe(true);
  });

  it('threshold boundary: 59.999s is short, 60s is offline', () => {
    const s = producingState();
    expect(applyOfflineProgress(s, BASE + 59_999).mode).toBe('short');
    expect(applyOfflineProgress(s, BASE + 60_000).mode).toBe('offline');
  });

  it('clock rollback (savedAt in the future): no gain, savedAt NOT rolled back', () => {
    const s = producingState(); // savedAt = BASE
    const now = BASE - 3600_000; // 1時間巻き戻し
    const r = applyOfflineProgress(s, now);
    expect(r.mode).toBe('none');
    expect(r.gained.eq(0)).toBe(true);
    expect(r.state.koban.eq(s.koban)).toBe(true);
    expect(r.state.savedAt).toBe(BASE); // 単調非減少
  });

  it('clock forward-back-forward round-trip cannot farm income twice', () => {
    const s = producingState(); // savedAt = BASE
    const fake = BASE + 8 * 3600 * 1000;
    // 1) 時計を8時間進めて収益取得
    const r1 = applyOfflineProgress(s, fake);
    expect(r1.gained.gt(0)).toBe(true);
    expect(r1.state.savedAt).toBe(fake);
    // 2) 実時間に戻す → 収益0、savedAt は据え置き
    const r2 = applyOfflineProgress(r1.state, BASE);
    expect(r2.gained.eq(0)).toBe(true);
    expect(r2.state.savedAt).toBe(fake);
    // 3) もう一度同じ未来時刻へ → 経過0なので収益0
    const r3 = applyOfflineProgress(r2.state, fake);
    expect(r3.gained.eq(0)).toBe(true);
  });

  it('no modal when nothing is produced', () => {
    const s = createInitialState(BASE); // 生産0
    const r = applyOfflineProgress(s, BASE + 3600_000);
    expect(r.mode).toBe('offline');
    expect(r.gained.eq(0)).toBe(true);
    expect(r.showModal).toBe(false);
    expect(r.state.savedAt).toBe(BASE + 3600_000);
  });

  it('adds gain to lifetimeKoban as well (feeds prestige math)', () => {
    const s = producingState();
    const r = applyOfflineProgress(s, BASE + 3600_000);
    expect(r.state.lifetimeKoban.sub(s.lifetimeKoban).eq(r.gained)).toBe(true);
  });

  it('does not mutate its input', () => {
    const s = producingState();
    const kobanBefore = s.koban;
    applyOfflineProgress(s, BASE + 3600_000);
    expect(s.koban).toBe(kobanBefore);
    expect(s.savedAt).toBe(BASE);
  });
});

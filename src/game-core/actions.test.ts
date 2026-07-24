import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import {
  buyGenerator,
  buyUpgrade,
  isGeneratorUnlocked,
  nextUpgradeId,
  prestige,
  tap,
} from './actions';
import { GENERATORS } from './data/generators';
import { createInitialState } from './initial';
import type { GameState } from './types';

function stateWithKoban(koban: number | string): GameState {
  const s = createInitialState(0);
  return { ...s, koban: new Decimal(koban), lifetimeKoban: new Decimal(koban) };
}

/** 入力 state をディープフリーズ。アクションがミューテーションすれば即 throw する */
function frozen(s: GameState): GameState {
  s.generators.forEach((g) => Object.freeze(g));
  Object.freeze(s.generators);
  Object.freeze(s.upgrades);
  Object.freeze(s.derived);
  return Object.freeze(s);
}

describe('buyGenerator', () => {
  it('returns same reference when unaffordable or unknown id', () => {
    const s = stateWithKoban(10); // 子ねこは15
    expect(buyGenerator(s, 'koneko')).toBe(s);
    const rich = stateWithKoban(100);
    expect(buyGenerator(rich, 'no-such-id')).toBe(rich);
  });

  it('deducts cost, increments owned and recomputes derived', () => {
    const s = stateWithKoban(15);
    const next = buyGenerator(s, 'koneko');
    expect(next).not.toBe(s);
    expect(next.koban.eq(0)).toBe(true);
    expect(next.generators[0].owned).toBe(1);
    expect(next.derived.prodPerSec.eq(0.1)).toBe(true);
    // 変更対象外の要素・配列は参照ごと維持(構造共有)
    expect(next.generators[1]).toBe(s.generators[1]);
    expect(next.upgrades).toBe(s.upgrades);
  });

  it('rejects locked generators (previous tier not owned)', () => {
    const s = stateWithKoban('1e12');
    expect(buyGenerator(s, 'chahakobi')).toBe(s); // 子ねこ0体では茶運びは未解放
    const withKoneko = buyGenerator(s, 'koneko');
    const next = buyGenerator(withKoneko, 'chahakobi');
    expect(next.generators[1].owned).toBe(1);
  });

  it('does not mutate its input (deep-frozen state)', () => {
    const s = frozen(stateWithKoban(1_000_000));
    const next = buyGenerator(s, 'koneko'); // freeze 下でミューテーションすれば throw
    expect(next.generators[0].owned).toBe(1);
    expect(s.koban.eq(1_000_000)).toBe(true);
    expect(s.generators[0].owned).toBe(0);
  });

  it('second purchase costs baseCost × 1.15', () => {
    const s = stateWithKoban(1000);
    const after1 = buyGenerator(s, 'koneko');
    const after2 = buyGenerator(after1, 'koneko');
    // Decimal.pow は対数経由のため最下位ビットまでは 15×1.15 と一致しない
    expect(after1.koban.sub(after2.koban).toNumber()).toBeCloseTo(17.25, 10);
  });
});

describe('buyUpgrade', () => {
  it('enforces sequential unlock order', () => {
    const s = stateWithKoban('1e9');
    expect(nextUpgradeId(s)).toBe('suzu');
    expect(buyUpgrade(s, 'zabuton')).toBe(s); // 前段未購入
    const withSuzu = buyUpgrade(s, 'suzu');
    expect(withSuzu.upgrades).toEqual(['suzu']);
    expect(nextUpgradeId(withSuzu)).toBe('zabuton');
  });

  it('returns same reference when unaffordable', () => {
    const s = stateWithKoban(999); // 鈴は1000
    expect(buyUpgrade(s, 'suzu')).toBe(s);
  });

  it('doubles tap gain', () => {
    const s = stateWithKoban(1000);
    const before = s.derived.tapGain;
    const next = buyUpgrade(s, 'suzu');
    expect(next.derived.tapGain.eq(before.mul(2))).toBe(true);
  });

  it('all three tiers: costs deducted in order, tap gain reaches ×8', () => {
    let s = stateWithKoban(10_000_000);
    const baseTap = s.derived.tapGain;
    for (const id of ['suzu', 'zabuton', 'kubiwa']) {
      s = buyUpgrade(frozen(s), id);
    }
    expect(s.upgrades).toEqual(['suzu', 'zabuton', 'kubiwa']);
    expect(new Decimal(10_000_000).sub(s.koban).eq(1_000 + 50_000 + 2_500_000)).toBe(true);
    expect(s.derived.tapGain.eq(baseTap.mul(8))).toBe(true);
    expect(nextUpgradeId(s)).toBeNull();
  });
});

describe('isGeneratorUnlocked', () => {
  it('first tier is always unlocked, later tiers need previous owned >= 1', () => {
    const s = createInitialState(0);
    expect(isGeneratorUnlocked(s, 0)).toBe(true);
    for (let i = 1; i < GENERATORS.length; i++) {
      expect(isGeneratorUnlocked(s, i)).toBe(false);
    }
    // i-1 番目を1体持てば i 番目が解放される(全段)
    for (let i = 1; i < GENERATORS.length; i++) {
      const generators = s.generators.map((g, j) => ({ ...g, owned: j === i - 1 ? 1 : 0 }));
      const st = { ...s, generators };
      expect(isGeneratorUnlocked(st, i)).toBe(true);
      if (i + 1 < GENERATORS.length) expect(isGeneratorUnlocked(st, i + 1)).toBe(false);
    }
  });
});

describe('tap', () => {
  it('adds tapGain to koban and lifetime, counts the tap', () => {
    const s = frozen(createInitialState(0));
    expect(s.derived.tapGain.eq(1)).toBe(true); // 初期状態はタップ1小判
    const next = tap(s);
    expect(next.koban.eq(1)).toBe(true);
    expect(next.lifetimeKoban.eq(1)).toBe(true);
    expect(next.totalTaps).toBe(1);
    // 入力は不変
    expect(s.koban.eq(0)).toBe(true);
    expect(s.totalTaps).toBe(0);
  });
});

describe('prestige', () => {
  it('does nothing below 1 nekodama gain', () => {
    const s = stateWithKoban(999_999);
    expect(prestige(s)).toBe(s);
  });

  it('does nothing when held nekodama already equals the theoretical total', () => {
    const base = stateWithKoban(4e6); // 理論値2個
    const s = { ...base, nekodama: new Decimal(2) };
    expect(prestige(s)).toBe(s);
  });

  it('resets run state, grants nekodama, keeps stats', () => {
    let s = stateWithKoban(4e6); // 理論値2個
    s = buyGenerator(s, 'koneko');
    s = buyUpgrade(s, 'suzu');
    s = tap(s);
    const next = prestige(frozen(s));
    expect(next.nekodama.eq(2)).toBe(true);
    expect(next.koban.eq(0)).toBe(true);
    expect(next.generators.every((g) => g.owned === 0)).toBe(true);
    expect(next.upgrades).toEqual([]);
    expect(next.prestigeCount).toBe(1);
    // 統計は保持(GDD §12)
    expect(next.lifetimeKoban.eq(s.lifetimeKoban)).toBe(true);
    expect(next.totalTaps).toBe(s.totalTaps);
    expect(next.startedAt).toBe(s.startedAt);
    // 転生直後のタップは猫玉倍率が効く(GDD §5)
    expect(next.derived.prodPerSec.eq(0)).toBe(true);
    expect(next.derived.tapGain.eq(1.2)).toBe(true); // 1 × (1 + 0.1×2)
  });

  it('second prestige only grants the difference', () => {
    const first = prestige(stateWithKoban(4e6)); // 所持2個
    const again = { ...first, lifetimeKoban: new Decimal(9e6) };
    const next = prestige(again);
    expect(next.nekodama.eq(3)).toBe(true); // 理論3 − 所持2 = +1
    expect(next.prestigeCount).toBe(2);
  });
});

import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { buyGenerator, buyUpgrade } from '../actions';
import { recomputeDerived } from '../derived';
import { createInitialState } from '../initial';
import type { GameState } from '../types';
import { migrate } from './migrate';
import { deserialize, serialize, SAVE_VERSION, type SaveData } from './serialize';

const NOW = 1_700_000_000_000;

function richState(): GameState {
  let s = createInitialState(NOW - 10_000);
  s = { ...s, koban: new Decimal('1.23e45'), lifetimeKoban: new Decimal('2.5e46') };
  s = buyGenerator(s, 'koneko');
  s = buyGenerator(s, 'koneko');
  s = buyGenerator(s, 'chahakobi');
  s = buyUpgrade(s, 'suzu');
  // nekodama を直接差し替えたら derived の再計算が必要(invariant)
  return recomputeDerived({ ...s, nekodama: new Decimal(7), prestigeCount: 3, totalTaps: 42 });
}

describe('serialize / deserialize round-trip', () => {
  it('preserves every persisted field and stamps savedAt with save time', () => {
    const s = richState();
    const restored = deserialize(JSON.parse(JSON.stringify(serialize(s, NOW))), NOW);
    expect(restored.koban.eq(s.koban)).toBe(true);
    expect(restored.lifetimeKoban.eq(s.lifetimeKoban)).toBe(true);
    expect(restored.nekodama.eq(s.nekodama)).toBe(true);
    expect(restored.generators).toEqual(s.generators.map((g) => ({ ...g })));
    expect(restored.upgrades).toEqual([...s.upgrades]);
    expect(restored.prestigeCount).toBe(s.prestigeCount);
    expect(restored.totalTaps).toBe(s.totalTaps);
    expect(restored.startedAt).toBe(s.startedAt);
    expect(restored.savedAt).toBe(NOW); // 保存時刻でスタンプされる
    // derived はシリアライズされず、復元時に再計算される
    expect(restored.derived.prodPerSec.eq(s.derived.prodPerSec)).toBe(true);
    expect(restored.derived.tapGain.eq(s.derived.tapGain)).toBe(true);
  });

  it('savedAt stamp is monotonic (never rolled back by an older clock)', () => {
    const s = { ...richState(), savedAt: NOW + 5_000 }; // 未来の透かし
    expect(serialize(s, NOW).savedAt).toBe(NOW + 5_000);
  });

  it('does not include derived in SaveData', () => {
    const save = serialize(richState(), NOW) as unknown as Record<string, unknown>;
    expect(save.derived).toBeUndefined();
  });

  it('round-trips exactly in the e15-e20 precision band', () => {
    // toString が toNumber() 経由になる帯(e < 21)の端数持ち mantissa
    for (let e = 15; e < 21; e++) {
      const d = new Decimal(`1e${e}`).add(1_234_567).add(0.7);
      const s = recomputeDerived({ ...createInitialState(NOW), koban: d });
      const restored = deserialize(JSON.parse(JSON.stringify(serialize(s, NOW))), NOW);
      expect(restored.koban.eq(d)).toBe(true);
    }
  });
});

describe('deserialize field-level fallback', () => {
  it('fills missing fields with defaults and keeps valid ones', () => {
    const restored = deserialize({ version: SAVE_VERSION, koban: '500' }, NOW);
    expect(restored.koban.eq(500)).toBe(true);
    expect(restored.lifetimeKoban.eq(0)).toBe(true);
    expect(restored.generators.length).toBe(8);
    expect(restored.upgrades).toEqual([]);
    expect(restored.savedAt).toBe(NOW);
    expect(restored.startedAt).toBe(NOW);
  });

  it('falls back per-field on invalid decimals (not whole save)', () => {
    const restored = deserialize(
      {
        koban: 'not-a-number',
        lifetimeKoban: '-5',
        nekodama: '3',
      } as Partial<SaveData>,
      NOW,
    );
    expect(restored.koban.eq(0)).toBe(true); // 不正 → 0
    expect(restored.lifetimeKoban.eq(0)).toBe(true); // 負 → 0
    expect(restored.nekodama.eq(3)).toBe(true); // 有効値は保持
  });

  it("rejects 'Infinity' and exponent-overflow strings", () => {
    const restored = deserialize(
      {
        koban: 'Infinity',
        lifetimeKoban: '1e999999999999999999',
        nekodama: '1e9000000000000000',
      } as Partial<SaveData>,
      NOW,
    );
    expect(restored.koban.eq(0)).toBe(true);
    expect(restored.lifetimeKoban.eq(0)).toBe(true);
    expect(restored.nekodama.eq(0)).toBe(true);
  });

  it('rejects adversarial decimal strings and non-finite numbers', () => {
    const cases: unknown[] = ['NaN', '-Infinity', '1e9e9', 'e5', '1.2.3', Infinity, NaN];
    for (const koban of cases) {
      const restored = deserialize({ koban } as Partial<SaveData>, NOW);
      expect(restored.koban.eq(0)).toBe(true);
    }
    // 正常形式は通る(指数の符号・大文字E含む)
    expect(deserialize({ koban: '1.5e+21' } as Partial<SaveData>, NOW).koban.eq('1.5e21')).toBe(true);
    expect(deserialize({ koban: '2E-3' } as Partial<SaveData>, NOW).koban.toNumber()).toBeCloseTo(0.002);
  });

  it('rejects counts outside the safe-integer range', () => {
    const restored = deserialize(
      {
        totalTaps: 1e300,
        prestigeCount: Number.MAX_VALUE,
        generators: [{ id: 'koneko', owned: 1e16 }], // > MAX_SAFE_INTEGER
      } as Partial<SaveData>,
      NOW,
    );
    expect(restored.totalTaps).toBe(0);
    expect(restored.prestigeCount).toBe(0);
    expect(restored.generators[0].owned).toBe(0);
  });

  it('normalizes generators to master order/length, dropping unknown ids', () => {
    const restored = deserialize(
      {
        generators: [
          { id: 'chahakobi', owned: 5 }, // 順序ずれ
          { id: 'ghost-cat', owned: 99 }, // 未知ID
          { id: 'koneko', owned: 2.9 }, // 小数 → floor
        ],
      },
      NOW,
    );
    expect(restored.generators.map((g) => g.id)).toEqual([
      'koneko', 'chahakobi', 'kanban', 'itamae', 'okami', 'chagama', 'jinja', 'manekineko',
    ]);
    expect(restored.generators[0].owned).toBe(2);
    expect(restored.generators[1].owned).toBe(5);
    expect(restored.generators[2].owned).toBe(0);
  });

  it('keeps only a valid unlock-order prefix of upgrades', () => {
    // 前段(鈴)なしで座布団だけ持つ不整合セーブ → 空に正規化
    expect(deserialize({ upgrades: ['zabuton'] }, NOW).upgrades).toEqual([]);
    // 両方所持は有効な状態。配列順は解放順に正規化される
    expect(deserialize({ upgrades: ['zabuton', 'suzu'] }, NOW).upgrades).toEqual(['suzu', 'zabuton']);
    // 途中が抜けた不整合(鈴+首輪)は有効な prefix まで切り詰め
    expect(deserialize({ upgrades: ['suzu', 'kubiwa'] }, NOW).upgrades).toEqual(['suzu']);
  });

  it('recomputes derived from restored fields', () => {
    const restored = deserialize(
      { generators: [{ id: 'koneko', owned: 10 }], nekodama: '10' },
      NOW,
    );
    // 0.1 × 10体 × milestone×2 × global×2 = 4
    expect(restored.derived.prodPerSec.eq(4)).toBe(true);
  });
});

describe('migrate', () => {
  it('accepts current version', () => {
    const save = serialize(richState(), NOW);
    expect(migrate(JSON.parse(JSON.stringify(save)))).not.toBeNull();
  });

  it('rejects non-objects and missing/invalid version as corrupt', () => {
    expect(migrate(null)).toBeNull();
    expect(migrate('hello')).toBeNull();
    expect(migrate([1, 2])).toBeNull();
    expect(migrate({})).toBeNull();
    expect(migrate({ koban: '5' })).toBeNull(); // version 欠落は補完せず破損扱い
    expect(migrate({ version: 'one' })).toBeNull();
    expect(migrate({ version: 1.5 })).toBeNull();
    expect(migrate({ version: 0 })).toBeNull();
  });

  it('rejects future versions (rollback from a newer build)', () => {
    expect(migrate({ version: SAVE_VERSION + 1 })).toBeNull();
  });

  it('strips unknown keys (defensive boundary)', () => {
    const out = migrate({ version: 1, koban: '5', evil: 'payload' });
    expect(out).not.toBeNull();
    expect('evil' in out!).toBe(false);
    expect(out!.koban).toBe('5');
  });
});

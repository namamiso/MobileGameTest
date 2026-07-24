import { describe, expect, it } from 'vitest';
import { GENERATORS } from './data/generators';
import { UPGRADES } from './data/upgrades';

/**
 * マスタデータを GDD の表とピン留めする(タイポ・順序ずれの回帰検知)。
 * ここを変える変更は GDD §4 / §6 の改訂とセットで行うこと。
 */

// GDD §4 の表: [id, baseCost, baseProd]
const GENERATOR_TABLE: Array<[string, number, number]> = [
  ['koneko', 15, 0.1],
  ['chahakobi', 100, 1],
  ['kanban', 1_100, 8],
  ['itamae', 12_000, 47],
  ['okami', 130_000, 260],
  ['chagama', 1_400_000, 1_400],
  ['jinja', 20_000_000, 7_800],
  ['manekineko', 330_000_000, 44_000],
];

// GDD §6 の表: [id, cost, tapMult]
const UPGRADE_TABLE: Array<[string, number, number]> = [
  ['suzu', 1_000, 2],
  ['zabuton', 50_000, 2],
  ['kubiwa', 2_500_000, 2],
];

describe('GENERATORS master data matches GDD §4', () => {
  it('has exactly 8 generators in GDD order', () => {
    expect(GENERATORS.map((g) => g.id)).toEqual(GENERATOR_TABLE.map(([id]) => id));
  });

  it.each(GENERATOR_TABLE)('%s: baseCost=%d baseProd=%d', (id, baseCost, baseProd) => {
    const def = GENERATORS.find((g) => g.id === id)!;
    expect(def.baseCost.eq(baseCost)).toBe(true);
    expect(def.baseProd.eq(baseProd)).toBe(true);
  });
});

describe('UPGRADES master data matches GDD §6', () => {
  it('has exactly 3 upgrades in unlock order', () => {
    expect(UPGRADES.map((u) => u.id)).toEqual(UPGRADE_TABLE.map(([id]) => id));
  });

  it.each(UPGRADE_TABLE)('%s: cost=%d tapMult=%d', (id, cost, mult) => {
    const def = UPGRADES.find((u) => u.id === id)!;
    expect(def.cost.eq(cost)).toBe(true);
    expect(def.tapMult).toBe(mult);
  });
});

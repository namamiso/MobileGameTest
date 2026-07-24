import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { GENERATORS } from './data/generators';
import {
  generatorCost,
  generatorProdPerSec,
  globalMult,
  milestoneMult,
  nekodamaGain,
  tapGain,
  tapMult,
} from './formulas';

const koneko = GENERATORS[0]; // baseCost 15, baseProd 0.1

describe('generatorCost', () => {
  it('is baseCost at 0 owned', () => {
    expect(generatorCost(koneko, 0).eq(15)).toBe(true);
  });

  it('grows by 1.15 per purchase', () => {
    expect(generatorCost(koneko, 1).eq(new Decimal(15).mul(1.15))).toBe(true);
    expect(generatorCost(koneko, 10).eq(new Decimal(15).mul(Decimal.pow(1.15, 10)))).toBe(true);
  });
});

describe('milestoneMult (10/25/50/100 boundaries)', () => {
  const cases: Array<[number, number]> = [
    [0, 1],
    [9, 1],
    [10, 2],
    [24, 2],
    [25, 4],
    [49, 4],
    [50, 8],
    [99, 8],
    [100, 16],
    [500, 16], // 上限 ×16
  ];
  it.each(cases)('owned=%i => x%i', (owned, mult) => {
    expect(milestoneMult(owned).eq(mult)).toBe(true);
  });
});

describe('globalMult', () => {
  it('is 1 with no nekodama', () => {
    expect(globalMult(new Decimal(0)).eq(1)).toBe(true);
  });
  it('adds 10% per nekodama', () => {
    expect(globalMult(new Decimal(5)).eq(1.5)).toBe(true);
    expect(globalMult(new Decimal(10)).eq(2)).toBe(true);
  });
});

describe('tapMult', () => {
  it('is 1 with no upgrades and 8 with all three', () => {
    expect(tapMult([]).eq(1)).toBe(true);
    expect(tapMult(['suzu', 'zabuton', 'kubiwa']).eq(8)).toBe(true);
  });
});

describe('generatorProdPerSec', () => {
  it('is 0 when none owned', () => {
    expect(generatorProdPerSec(koneko, 0, new Decimal(2)).eq(0)).toBe(true);
  });
  it('applies owned, milestone and global multipliers', () => {
    // 0.1 × 10体 × milestone(×2) × global(×1.5) = 3
    expect(generatorProdPerSec(koneko, 10, new Decimal(1.5)).eq(3)).toBe(true);
  });
});

describe('tapGain', () => {
  it('falls back to 1 × globalMult when production is 0 (post-prestige)', () => {
    expect(tapGain(new Decimal(0), new Decimal(1.5), new Decimal(1)).eq(1.5)).toBe(true);
  });
  it('uses 1% of production when larger', () => {
    expect(tapGain(new Decimal(1000), new Decimal(1), new Decimal(1)).eq(10)).toBe(true);
  });
  it('multiplies by tapMult', () => {
    expect(tapGain(new Decimal(1000), new Decimal(1), new Decimal(8)).eq(80)).toBe(true);
  });

  it('switches from floor to 1% around the boundary', () => {
    const global = new Decimal(1.5);
    // 直前: 下限(globalMult)が勝つ
    expect(tapGain(new Decimal(149), global, new Decimal(1)).eq(1.5)).toBe(true);
    // 直後: 1% 側が勝つ
    expect(tapGain(new Decimal(151), global, new Decimal(1)).eq(1.51)).toBe(true);
  });
});

describe('nekodamaGain', () => {
  it('is 0 below the 1e6 threshold', () => {
    expect(nekodamaGain(new Decimal(999_999), new Decimal(0)).eq(0)).toBe(true);
  });
  it('is 1 at exactly 1e6 and grows as sqrt', () => {
    expect(nekodamaGain(new Decimal(1e6), new Decimal(0)).eq(1)).toBe(true);
    expect(nekodamaGain(new Decimal(4e6), new Decimal(0)).eq(2)).toBe(true);
    expect(nekodamaGain(new Decimal(9e6), new Decimal(0)).eq(3)).toBe(true);
  });

  it('floors correctly just below a perfect square (sqrt precision)', () => {
    expect(nekodamaGain(new Decimal(3_999_999), new Decimal(0)).eq(1)).toBe(true);
    expect(nekodamaGain(new Decimal(4_000_000), new Decimal(0)).eq(2)).toBe(true);
  });
  it('subtracts currently held nekodama and clamps at 0', () => {
    expect(nekodamaGain(new Decimal(9e6), new Decimal(1)).eq(2)).toBe(true);
    expect(nekodamaGain(new Decimal(1e6), new Decimal(5)).eq(0)).toBe(true);
  });
  it('handles values beyond Number range', () => {
    // sqrt(1e412 / 1e6) = 1e203
    expect(nekodamaGain(new Decimal('1e412'), new Decimal(0)).eq(new Decimal('1e203'))).toBe(true);
  });
});

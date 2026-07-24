import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';

// フェーズ0のスモークテスト: 大数ライブラリとテスト基盤の動作確認
describe('break_infinity.js', () => {
  it('basic arithmetic works', () => {
    expect(new Decimal(2).mul(3).toNumber()).toBe(6);
  });

  it('survives beyond Number.MAX_VALUE', () => {
    const big = new Decimal('1e400').mul(10);
    expect(big.exponent).toBe(401);
  });

  it('string round-trip', () => {
    const d = new Decimal('1.23e45');
    expect(new Decimal(d.toString()).eq(d)).toBe(true);
  });
});

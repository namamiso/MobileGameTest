import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { formatDuration, formatKoban } from './format';

const d = (v: number | string) => new Decimal(v);

describe('formatKoban (floor)', () => {
  it('integers below 1万 are floored plainly', () => {
    expect(formatKoban(d(0))).toBe('0');
    expect(formatKoban(d(0.7))).toBe('0');
    expect(formatKoban(d(1))).toBe('1');
    expect(formatKoban(d(9999.9))).toBe('9999');
  });

  it('boundary 9999 → 1万', () => {
    expect(formatKoban(d(9999))).toBe('9999');
    expect(formatKoban(d(10_000))).toBe('1万');
  });

  it('uses 3 significant digits with the unit', () => {
    expect(formatKoban(d(12_345))).toBe('1.23万');
    expect(formatKoban(d(123_456))).toBe('12.3万');
    expect(formatKoban(d(1_234_567))).toBe('123万');
    expect(formatKoban(d(12_345_678))).toBe('1234万');
  });

  it('crosses unit boundaries at every 1e4', () => {
    expect(formatKoban(d(1e8))).toBe('1億');
    expect(formatKoban(d(1.234e8))).toBe('1.23億');
    expect(formatKoban(d(1e12))).toBe('1兆');
    expect(formatKoban(d(1e16))).toBe('1京');
    expect(formatKoban(d('1e68'))).toBe('1無量大数');
    expect(formatKoban(d('9.99e71'))).toBe('9990無量大数');
  });

  it('falls back to exponent notation at 1e72', () => {
    expect(formatKoban(d('1e72'))).toBe('1e72');
    expect(formatKoban(d('1.234e75'))).toBe('1.23e75');
    expect(formatKoban(d('1e308'))).toBe('1e308');
    expect(formatKoban(d('1.5e400'))).toBe('1.5e400');
  });

  it('trims trailing zeros', () => {
    expect(formatKoban(d(15_000))).toBe('1.5万');
    expect(formatKoban(d(120_000))).toBe('12万');
  });
});

describe('formatKoban (ceil — cost display)', () => {
  it('ceils so a shown price is never lower than the real one', () => {
    expect(formatKoban(d(12_301), 'ceil')).toBe('1.24万');
    expect(formatKoban(d(12_345), 'floor')).toBe('1.23万');
    expect(formatKoban(d(101.2), 'ceil')).toBe('102');
  });

  it('carries into the next unit when ceiling 9999.x', () => {
    expect(formatKoban(d(99_996_000), 'ceil')).toBe('1億'); // 9999.6万 → 繰り上がり
    expect(formatKoban(d(99_996_000), 'floor')).toBe('9999万');
  });

  it('ceiling just below 1万 crosses into unit notation', () => {
    expect(formatKoban(d(9999.5), 'ceil')).toBe('1万');
    expect(formatKoban(d(9999.5), 'floor')).toBe('9999');
  });

  it('exponent notation also ceils', () => {
    expect(formatKoban(d('1.234e75'), 'ceil')).toBe('1.24e75');
  });
});

describe('formatDuration', () => {
  it('formats seconds, minutes, hours', () => {
    expect(formatDuration(45)).toBe('45秒');
    expect(formatDuration(60)).toBe('1分');
    expect(formatDuration(59 * 60)).toBe('59分');
    expect(formatDuration(3600)).toBe('1時間');
    expect(formatDuration(2 * 3600 + 30 * 60)).toBe('2時間30分');
    expect(formatDuration(8 * 3600)).toBe('8時間');
  });
});

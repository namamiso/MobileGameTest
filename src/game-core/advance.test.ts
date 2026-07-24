import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { buyGenerator } from './actions';
import { advance } from './advance';
import { createInitialState } from './initial';

describe('advance', () => {
  it('returns same reference when production is 0 (structural sharing)', () => {
    const s = createInitialState(0);
    expect(advance(s, 0.1)).toBe(s);
  });

  it('returns same reference for non-positive dt', () => {
    let s = createInitialState(0);
    s = { ...s, koban: new Decimal(15) };
    s = buyGenerator(s, 'koneko');
    expect(advance(s, 0)).toBe(s);
    expect(advance(s, -1)).toBe(s);
  });

  it('returns same reference for non-finite dt', () => {
    let s = createInitialState(0);
    s = { ...s, koban: new Decimal(15) };
    s = buyGenerator(s, 'koneko');
    expect(advance(s, NaN)).toBe(s);
    expect(advance(s, Infinity)).toBe(s);
  });

  it('adds production × dt to koban and lifetime', () => {
    let s = createInitialState(0);
    s = { ...s, koban: new Decimal(15) };
    s = buyGenerator(s, 'koneko'); // 0.1/秒
    const next = advance(s, 10);
    expect(next.koban.eq(1)).toBe(true);
    expect(next.lifetimeKoban.sub(s.lifetimeKoban).eq(1)).toBe(true);
  });

  it('keeps unchanged fields by reference (generators array)', () => {
    let s = createInitialState(0);
    s = { ...s, koban: new Decimal(15) };
    s = buyGenerator(s, 'koneko');
    const next = advance(s, 1);
    expect(next.generators).toBe(s.generators);
    expect(next.derived).toBe(s.derived);
  });

  it('is linear in dt', () => {
    let s = createInitialState(0);
    s = { ...s, koban: new Decimal(15) };
    s = buyGenerator(s, 'koneko');
    const a = advance(s, 5);
    const b = advance(advance(advance(s, 2), 2), 1);
    expect(a.koban.eq(b.koban)).toBe(true);
  });
});

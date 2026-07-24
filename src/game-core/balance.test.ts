import Decimal from 'break_infinity.js';
import { describe, expect, it } from 'vitest';
import { buyGenerator, buyUpgrade, nextUpgradeId, tap } from './actions';
import { advance } from './advance';
import { GENERATORS } from './data/generators';
import { recomputeDerived } from './derived';
import { createInitialState } from './initial';
import { PRESTIGE_UNLOCK } from './formulas';
import type { GameState } from './types';

/**
 * フェーズ6のバランススモーク(IMPLEMENTATION_PLAN)。
 * カジュアルなアクティブプレイ(毎秒3タップ+買えるものを即購入)を1秒刻みで
 * シミュレートし、初回転生(累計100万)への到達時間が GDD §8 の目安
 * (アクティブで30分〜6時間)に収まることを固定する。
 */
function simulateSecondsToFirstPrestige(capSec: number): { seconds: number; state: GameState } {
  let s = createInitialState(0);
  let t = 0;
  while (s.lifetimeKoban.lt(PRESTIGE_UNLOCK) && t < capSec) {
    s = advance(s, 1);
    for (let i = 0; i < 3; i++) s = tap(s);
    // 買えるものは即購入(強化優先、店員はマスタ順で最初に買える1体)
    let bought = true;
    while (bought) {
      bought = false;
      const upId = nextUpgradeId(s);
      if (upId !== null) {
        const next = buyUpgrade(s, upId);
        if (next !== s) {
          s = next;
          bought = true;
        }
      }
      for (const def of GENERATORS) {
        const next = buyGenerator(s, def.id);
        if (next !== s) {
          s = next;
          bought = true;
          break;
        }
      }
    }
    t += 1;
  }
  return { seconds: t, state: s };
}

describe('balance smoke', () => {
  it('first prestige is reachable in a few active hours (not trivially fast)', () => {
    const cap = 8 * 3600;
    const { seconds, state } = simulateSecondsToFirstPrestige(cap);
    expect(state.lifetimeKoban.gte(PRESTIGE_UNLOCK)).toBe(true); // cap 内に到達する
    // 早すぎる(30分未満)ならインフレ暴走、6時間超なら重すぎ — どちらも仕様想定から逸脱
    expect(seconds).toBeGreaterThan(30 * 60);
    expect(seconds).toBeLessThan(6 * 3600);
  });

  it('tick cost stays cheap at late-game scale (100 of everything)', () => {
    let s: GameState = {
      ...createInitialState(0),
      // 生産の加算(≈5e11/1000秒)が有効桁に現れる規模にする(1e30 だと ulp 未満で消える)
      koban: new Decimal('1e12'),
      lifetimeKoban: new Decimal('1e12'),
      nekodama: new Decimal(50),
      generators: GENERATORS.map((g) => ({ id: g.id, owned: 100 })),
      upgrades: ['suzu', 'zabuton', 'kubiwa'],
    };
    s = recomputeDerived(s);
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) {
      s = advance(s, 0.1); // 10 tick/秒 × 1000秒ぶん
    }
    const elapsedMs = performance.now() - start;
    // 10,000 tick < 500ms(1 tick あたり 0.05ms)なら実行時負荷は無視できる
    expect(elapsedMs).toBeLessThan(500);
    expect(s.koban.gt('1e12')).toBe(true);
  });
});

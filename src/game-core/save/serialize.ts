import Decimal from 'break_infinity.js';
import { GENERATORS } from '../data/generators';
import { UPGRADES } from '../data/upgrades';
import { recomputeDerived } from '../derived';
import type { GameState } from '../types';

export const SAVE_VERSION = 1 as const;

/** SaveData v1(TECH_DESIGN §9)。derived は含めない */
export interface SaveData {
  version: typeof SAVE_VERSION;
  savedAt: number;
  koban: string;
  lifetimeKoban: string;
  nekodama: string;
  generators: { id: string; owned: number }[];
  upgrades: string[];
  prestigeCount: number;
  totalTaps: number;
  startedAt: number;
}

/**
 * GameState → SaveData。nowMs は保存時刻(epoch ms)。
 * savedAt は max(state.savedAt, now) でスタンプする — セーブ時刻を刻まないと
 * 次回起動時にオンラインプレイ済みの区間まで二重にオフライン収益化される。
 * max なのは時計改ざん対策の単調非減少規則(GDD §7)を保存経路でも守るため。
 */
export function serialize(state: GameState, nowMs: number): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: Math.max(state.savedAt, nowMs),
    koban: state.koban.toString(),
    lifetimeKoban: state.lifetimeKoban.toString(),
    nekodama: state.nekodama.toString(),
    generators: state.generators.map((g) => ({ id: g.id, owned: g.owned })),
    upgrades: [...state.upgrades],
    prestigeCount: state.prestigeCount,
    totalTaps: state.totalTaps,
    startedAt: state.startedAt,
  };
}

/**
 * 不正値はフィールド単位で 0 にフォールバック(セーブ全体は捨てない。TECH_DESIGN §9)。
 * break_infinity は不正文字列で throw するため try/catch が必須。
 * NaN/Infinity 判定は mantissa/exponent を直接見る(instance メソッドが無い)。
 */
/**
 * break_infinity の内部指数上限(EXP_LIMIT)。'Infinity' や巨大指数の文字列は
 * mantissa/exponent とも有限値のままこの上限に張り付くため、明示的に弾く。
 */
const DECIMAL_EXP_LIMIT = 9e15;

/**
 * 受理する文字列形式。break_infinity の fromString は 'Infinity' を有限ペアに
 * 変換し、'1e9e9' を黙って 1e9 と誤パースするため、構築前に形式で弾く。
 * (自前の toString 出力は '123.45' / '1.5e+21' / '1e-7' 形式で全て通る)
 */
const DECIMAL_PATTERN = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/;

function parseDecimal(raw: unknown): Decimal {
  if (typeof raw !== 'string' && typeof raw !== 'number') return new Decimal(0);
  if (typeof raw === 'string' && !DECIMAL_PATTERN.test(raw)) return new Decimal(0);
  if (typeof raw === 'number' && !Number.isFinite(raw)) return new Decimal(0);
  try {
    const d = new Decimal(raw);
    if (
      !Number.isFinite(d.mantissa) ||
      !Number.isFinite(d.exponent) ||
      d.exponent >= DECIMAL_EXP_LIMIT ||
      d.lt(0)
    ) {
      return new Decimal(0);
    }
    return d;
  } catch {
    return new Decimal(0);
  }
}

function parseCount(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return 0;
  const n = Math.floor(raw);
  // 安全整数範囲外は所持数・統計として精度が保てないため受理しない
  return Number.isSafeInteger(n) ? n : 0;
}

function parseEpochMs(raw: unknown, fallback: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return fallback;
  return raw;
}

/**
 * SaveData → GameState。
 * generators は「マスタと同順・同長」の invariant をここで正規化する
 * (順序ずれ・欠落・未知IDのセーブが来ても壊さない)。
 * now は epoch ms(savedAt / startedAt 欠落時のフォールバック)。
 */
export function deserialize(save: Partial<SaveData>, now: number): GameState {
  const savedGenerators = Array.isArray(save.generators) ? save.generators : [];
  const generators = GENERATORS.map((def) => {
    const found = savedGenerators.find((g) => g && g.id === def.id);
    return { id: def.id, owned: parseCount(found?.owned) };
  });

  // 強化は解放順の prefix のみ有効(前段なしの購入済みは不整合として捨てる)
  const savedUpgrades = Array.isArray(save.upgrades) ? save.upgrades : [];
  const upgrades: string[] = [];
  for (const def of UPGRADES) {
    if (savedUpgrades.includes(def.id)) upgrades.push(def.id);
    else break;
  }

  return recomputeDerived({
    koban: parseDecimal(save.koban),
    lifetimeKoban: parseDecimal(save.lifetimeKoban),
    nekodama: parseDecimal(save.nekodama),
    generators,
    upgrades,
    prestigeCount: parseCount(save.prestigeCount),
    totalTaps: parseCount(save.totalTaps),
    startedAt: parseEpochMs(save.startedAt, now),
    savedAt: parseEpochMs(save.savedAt, now),
    derived: { prodPerSec: new Decimal(0), tapGain: new Decimal(0) },
  });
}

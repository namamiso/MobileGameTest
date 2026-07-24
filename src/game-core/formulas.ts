import Decimal from 'break_infinity.js';
import { COST_GROWTH, MILESTONES, type GeneratorDef } from './data/generators';
import { UPGRADES } from './data/upgrades';

/**
 * n体目(owned 体所持時)の購入コスト: baseCost × 1.15^owned(GDD §4)。
 * Decimal.pow は対数経由で最下位ビットの誤差を持つため、コスト計算は
 * 必ずこの関数を唯一の経路とすること(別経路で再計算すると
 * 「表示上買えるのに買えない」等値境界バグの温床になる)。
 */
export function generatorCost(def: GeneratorDef, owned: number): Decimal {
  return def.baseCost.mul(Decimal.pow(COST_GROWTH, owned));
}

/** 所持数に応じたマイルストーン倍率(10/25/50/100 体で各 ×2、最大 ×16) */
export function milestoneMult(owned: number): Decimal {
  const reached = MILESTONES.filter((m) => owned >= m).length;
  return Decimal.pow(2, reached);
}

/** globalMult = 1 + 0.10 × 猫玉所持数(GDD §4。タップ強化は含まない) */
export function globalMult(nekodama: Decimal): Decimal {
  return nekodama.mul(0.1).add(1);
}

/** 購入済みタップ強化の合計倍率(乗算) */
export function tapMult(purchasedUpgradeIds: readonly string[]): Decimal {
  let mult = new Decimal(1);
  for (const def of UPGRADES) {
    if (purchasedUpgradeIds.includes(def.id)) mult = mult.mul(def.tapMult);
  }
  return mult;
}

/** 1種の生産/秒: baseProd × owned × milestoneMult × globalMult(GDD §4) */
export function generatorProdPerSec(
  def: GeneratorDef,
  owned: number,
  global: Decimal,
): Decimal {
  if (owned === 0) return new Decimal(0);
  return def.baseProd.mul(owned).mul(milestoneMult(owned)).mul(global);
}

/**
 * タップ収入: max(1 × globalMult, 総生産/秒 × 1%) × tapMult(GDD §5)
 * prodPerSec は globalMult 適用後の最終値を渡すこと。
 */
export function tapGain(prodPerSec: Decimal, global: Decimal, tap: Decimal): Decimal {
  return Decimal.max(global, prodPerSec.mul(0.01)).mul(tap);
}

/** のれん分けの解放しきい値(GDD §8) */
export const PRESTIGE_UNLOCK = new Decimal(1_000_000);

/**
 * のれん分けで得られる猫玉:
 * max(0, floor(sqrt(lifetimeKoban / 1e6)) − 現在の所持猫玉数)(GDD §8)
 */
export function nekodamaGain(lifetimeKoban: Decimal, currentNekodama: Decimal): Decimal {
  const theoretical = lifetimeKoban.div(PRESTIGE_UNLOCK).sqrt().floor();
  return Decimal.max(new Decimal(0), theoretical.sub(currentNekodama));
}

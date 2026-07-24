import Decimal from 'break_infinity.js';

export interface UpgradeDef {
  readonly id: string;
  readonly name: string;
  readonly cost: Decimal;
  /** タップ収入への倍率(乗算) */
  readonly tapMult: number;
}

/**
 * GDD §6 のタップ強化マスタ。
 * 配列順 = 解放順(前段を購入すると次段が解放される)
 */
export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'suzu', name: '鈴', cost: new Decimal(1_000), tapMult: 2 },
  { id: 'zabuton', name: '座布団', cost: new Decimal(50_000), tapMult: 2 },
  { id: 'kubiwa', name: '金の首輪', cost: new Decimal(2_500_000), tapMult: 2 },
];

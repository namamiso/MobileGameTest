import Decimal from 'break_infinity.js';

export interface GeneratorDef {
  readonly id: string;
  readonly name: string;
  readonly baseCost: Decimal;
  readonly baseProd: Decimal;
}

/** GDD §4 の店員マスタ */
export const GENERATORS: readonly GeneratorDef[] = [
  { id: 'koneko', name: '子ねこ店員', baseCost: new Decimal(15), baseProd: new Decimal(0.1) },
  { id: 'chahakobi', name: '茶運びねこ', baseCost: new Decimal(100), baseProd: new Decimal(1) },
  { id: 'kanban', name: '看板ねこ', baseCost: new Decimal(1_100), baseProd: new Decimal(8) },
  { id: 'itamae', name: '板前ねこ', baseCost: new Decimal(12_000), baseProd: new Decimal(47) },
  { id: 'okami', name: '女将ねこ', baseCost: new Decimal(130_000), baseProd: new Decimal(260) },
  { id: 'chagama', name: 'からくり茶釜', baseCost: new Decimal(1_400_000), baseProd: new Decimal(1_400) },
  { id: 'jinja', name: 'ねこ神社', baseCost: new Decimal(20_000_000), baseProd: new Decimal(7_800) },
  { id: 'manekineko', name: '招き猫像', baseCost: new Decimal(330_000_000), baseProd: new Decimal(44_000) },
];

/** 購入ごとのコスト成長率(GDD §4) */
export const COST_GROWTH = 1.15;

/** 所持数がこの値に達するごとに、その店員の生産 ×2(GDD §4) */
export const MILESTONES: readonly number[] = [10, 25, 50, 100];

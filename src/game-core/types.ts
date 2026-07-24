import type Decimal from 'break_infinity.js';

export interface GeneratorState {
  readonly id: string;
  readonly owned: number;
}

/** 派生値キャッシュ。保存対象外(TECH_DESIGN §5) */
export interface DerivedValues {
  /** マイルストーン・globalMult 適用後の総生産/秒 */
  readonly prodPerSec: Decimal;
  /** 1タップの獲得小判 */
  readonly tapGain: Decimal;
}

export interface GameState {
  readonly koban: Decimal;
  /** 全期間累計獲得小判。転生でもリセットしない(GDD §3) */
  readonly lifetimeKoban: Decimal;
  readonly nekodama: Decimal;
  /**
   * マスタ(GENERATORS)と同順・同長を invariant とする。
   * 外部入力(セーブ)は deserialize / migrate で必ず正規化する。
   */
  readonly generators: readonly GeneratorState[];
  /** 購入済みタップ強化ID。転生で空になる */
  readonly upgrades: readonly string[];
  readonly prestigeCount: number;
  readonly totalTaps: number;
  /** epoch ms */
  readonly startedAt: number;
  /** 最終保存時刻 epoch ms。オフライン計算の基準 */
  readonly savedAt: number;
  readonly derived: DerivedValues;
}

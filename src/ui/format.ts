import type Decimal from 'break_infinity.js';

/**
 * 日本語数値単位(GDD §10 / TECH_DESIGN §12)。
 * UNITS[i] は 1e(4×(i+1))。万(1e4)〜無量大数(1e68)。
 * 1e72 以上は指数表記にフォールバックする。
 * Decimal の mantissa/exponent を直接使い、toNumber() を経由しない
 * (1e308 超で破綻するため)。
 */
const UNITS = [
  '万', '億', '兆', '京', '垓', '𥝱', '穣', '溝', '澗', '正',
  '載', '極', '恒河沙', '阿僧祇', '那由他', '不可思議', '無量大数',
] as const;

export type RoundMode = 'floor' | 'ceil';

/** 丸め方向の使い分け: 残高・生産は floor、コスト表示は ceil(GDD §10) */
export function formatKoban(value: Decimal, mode: RoundMode = 'floor'): string {
  if (value.lte(0)) return '0';
  if (value.lt(10_000)) {
    const n = value.toNumber();
    const r = mode === 'floor' ? Math.floor(n + 1e-9) : Math.ceil(n - 1e-9);
    // ceil で1万に到達したら単位表記へ(「10000」は GDD §10 違反)
    if (r < 10_000) return String(r);
    return '1万';
  }
  const e = value.exponent;
  if (e >= 72) return formatExponent(value.mantissa, e, mode);

  let unitIdx = Math.min(Math.floor(e / 4) - 1, UNITS.length - 1);
  let val = value.mantissa * Math.pow(10, e - 4 * (unitIdx + 1)); // [1, 10000)
  let rounded = roundSig(val, mode);
  if (rounded >= 10_000) {
    // ceil の繰り上がりで単位を跨いだ(9999.6万 → 1億)
    if (unitIdx === UNITS.length - 1) return formatExponent(1, 72, 'floor');
    unitIdx += 1;
    val = rounded / 10_000;
    rounded = roundSig(val, mode);
  }
  return `${trimZeros(rounded, decimalsFor(rounded))}${UNITS[unitIdx]}`;
}

/** 有効3桁程度: 100以上は整数、10以上は小数1桁、それ未満は2桁 */
function decimalsFor(val: number): number {
  return val >= 100 ? 0 : val >= 10 ? 1 : 2;
}

function roundSig(val: number, mode: RoundMode): number {
  const f = Math.pow(10, decimalsFor(val));
  // 二進表現の誤差で桁がずれないよう微小 epsilon で補正する
  return (mode === 'floor' ? Math.floor(val * f + 1e-9) : Math.ceil(val * f - 1e-9)) / f;
}

function trimZeros(val: number, decimals: number): string {
  return val
    .toFixed(decimals)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');
}

function formatExponent(mantissa: number, exponent: number, mode: RoundMode): string {
  let scaled = mode === 'floor'
    ? Math.floor(mantissa * 100 + 1e-9)
    : Math.ceil(mantissa * 100 - 1e-9); // [100, 1000)
  let e = exponent;
  if (scaled >= 1000) {
    scaled = Math.floor(scaled / 10);
    e += 1;
  }
  return `${trimZeros(scaled / 100, 2)}e${e}`;
}

/** オフラインモーダル等の経過時間表示 */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm === 0 ? `${h}時間` : `${h}時間${rm}分`;
}

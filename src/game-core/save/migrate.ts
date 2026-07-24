import { SAVE_VERSION, type SaveData } from './serialize';

/**
 * 生の JSON 値を現行バージョンの SaveData へ引き上げる。
 * 復旧不能(オブジェクトでない / version が未知の新しさ)は null を返し、
 * 呼び出し側(persistence)が「破損」として退避+初期化する(TECH_DESIGN §9)。
 * フィールド単位の欠落・型不正は deserialize 側が補完する。
 */
export function migrate(data: unknown): Partial<SaveData> | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const version = record.version;
  if (typeof version !== 'number' || !Number.isInteger(version)) return null;
  // 将来版からのロールバックは互換性を保証できないため破損と同扱い
  if (version > SAVE_VERSION || version < 1) return null;

  // version 1: 現行。バージョンを上げたら case を追加して段階適用する。
  // 既知キーのみを抽出して返す(未知キーを下流へ漏らさない防御的境界)
  return {
    version: SAVE_VERSION,
    savedAt: record.savedAt as SaveData['savedAt'],
    koban: record.koban as SaveData['koban'],
    lifetimeKoban: record.lifetimeKoban as SaveData['lifetimeKoban'],
    nekodama: record.nekodama as SaveData['nekodama'],
    generators: record.generators as SaveData['generators'],
    upgrades: record.upgrades as SaveData['upgrades'],
    prestigeCount: record.prestigeCount as SaveData['prestigeCount'],
    totalTaps: record.totalTaps as SaveData['totalTaps'],
    startedAt: record.startedAt as SaveData['startedAt'],
  };
}

'use client';

import { useGameValue } from '@/store/gameStore';
import { formatKoban } from './format';
import styles from './GameRoot.module.css';

/**
 * 毎 tick 変わる数値の購読はこのコンポーネントに閉じ込める(TECH_DESIGN §6)。
 * 表示文字列で select することで、フォーマット結果が変わらない tick は
 * 再レンダリングされない(koban は毎 tick 値が変わるため Decimal eq では防げない)。
 */
export function Hud({ onOpenSettings }: { onOpenSettings: () => void }) {
  const koban = useGameValue((s) => formatKoban(s.state.koban));
  const prodPerSec = useGameValue((s) => formatKoban(s.state.derived.prodPerSec));
  const nekodama = useGameValue((s) =>
    s.state.nekodama.gt(0) ? formatKoban(s.state.nekodama) : null,
  );

  return (
    <header className={styles.hud}>
      <div>
        <div className={styles.hudKoban}>{koban} 小判</div>
        <div className={styles.hudSub}>
          {prodPerSec}/秒
          {nekodama !== null && <> ・ 猫玉 {nekodama}</>}
        </div>
      </div>
      <button className={styles.settingsButton} onClick={onOpenSettings} aria-label="設定">
        ⚙
      </button>
    </header>
  );
}

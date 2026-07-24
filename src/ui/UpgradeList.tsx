'use client';

import { nextUpgradeId } from '@/game-core/actions';
import { UPGRADES } from '@/game-core/data/upgrades';
import { jsonEq, useGameStore, useGameValue } from '@/store/gameStore';
import { formatKoban } from './format';
import styles from './GameRoot.module.css';

interface Row {
  id: string;
  name: string;
  tapMult: number;
  purchased: boolean;
  isNext: boolean;
  affordable: boolean;
  cost: string;
}

/**
 * 強化タブ(GDD §6)。上から順の買い切り3段。前段購入で次段解放。
 * 表示用プリミティブに落として購読(TECH_DESIGN §6)。
 */
export function UpgradeList() {
  const rows = useGameValue<Row[]>((s) => {
    const st = s.state;
    const nextId = nextUpgradeId(st);
    return UPGRADES.map((u) => ({
      id: u.id,
      name: u.name,
      tapMult: u.tapMult,
      purchased: st.upgrades.includes(u.id),
      isNext: nextId === u.id,
      affordable: st.koban.gte(u.cost),
      cost: formatKoban(u.cost, 'ceil'),
    }));
  }, jsonEq);
  const buy = useGameStore((s) => s.buyUpgrade);

  return (
    <div>
      {rows.map((row) => (
        <div
          key={row.id}
          className={`${styles.row} ${row.purchased || row.isNext ? '' : styles.locked}`}
        >
          <div className={styles.rowInfo}>
            <div className={styles.rowName}>{row.name}</div>
            <div className={styles.rowSub}>
              タップ収入 ×{row.tapMult}
              {!row.purchased && !row.isNext && ' ・ 前の強化を購入で解放'}
            </div>
          </div>
          {row.purchased ? (
            <button className={styles.buyButton} disabled>
              購入済み
            </button>
          ) : (
            <button
              className={styles.buyButton}
              disabled={!row.isNext || !row.affordable}
              onClick={() => buy(row.id)}
            >
              {row.cost}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

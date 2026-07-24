'use client';

import { isGeneratorUnlocked } from '@/game-core/actions';
import { GENERATORS, MILESTONES } from '@/game-core/data/generators';
import { generatorCost, generatorProdPerSec, globalMult } from '@/game-core/formulas';
import { jsonEq, useGameStore, useGameValue } from '@/store/gameStore';
import { formatKoban } from './format';
import styles from './GameRoot.module.css';

interface Row {
  id: string;
  name: string;
  owned: number;
  teaser: boolean;
  cost: string;
  prod: string;
  affordable: boolean;
  /** 次のマイルストーンまでの残数(なければ null) */
  toNextMilestone: number | null;
}

/**
 * 店員タブ(GDD §4, §9)。
 * 行: 名前 / 所持数 / その種の合計生産 / コスト(購入ボタン)。
 * 解放済み+次の1種(???)のみ表示。コストは切り上げ、生産は切り捨て表示。
 * セレクタで表示用プリミティブに落とし、表示が変わる tick だけ再レンダリング
 * (TECH_DESIGN §6)。
 */
export function GeneratorList() {
  const rows = useGameValue<Row[]>((s) => {
    const st = s.state;
    const global = globalMult(st.nekodama);
    const out: Row[] = [];
    for (let i = 0; i < GENERATORS.length; i++) {
      const def = GENERATORS[i];
      const owned = st.generators[i].owned;
      const unlocked = isGeneratorUnlocked(st, i);
      const teaser = !unlocked && i > 0 && isGeneratorUnlocked(st, i - 1);
      if (!unlocked && !teaser) continue;
      const cost = generatorCost(def, owned);
      const nextMilestone = MILESTONES.find((m) => owned < m);
      out.push({
        id: def.id,
        name: def.name,
        owned,
        teaser,
        cost: formatKoban(cost, 'ceil'),
        prod: teaser ? '' : formatKoban(generatorProdPerSec(def, owned, global)),
        affordable: !teaser && st.koban.gte(cost),
        toNextMilestone: teaser || nextMilestone === undefined ? null : nextMilestone - owned,
      });
    }
    return out;
  }, jsonEq);
  const buy = useGameStore((s) => s.buyGenerator);

  return (
    <div>
      {rows.map((row) =>
        row.teaser ? (
          <div key={row.id} className={`${styles.row} ${styles.locked}`}>
            <div className={styles.rowInfo}>
              <div className={styles.rowName}>???</div>
              <div className={styles.rowSub}>前の店員を雇うと解放</div>
            </div>
            <button className={styles.buyButton} disabled>
              {row.cost}
            </button>
          </div>
        ) : (
          <div key={row.id} className={styles.row}>
            <div className={styles.rowInfo}>
              <div className={styles.rowName}>
                {row.name} <small>×{row.owned}</small>
              </div>
              <div className={styles.rowSub}>
                {row.prod}/秒
                {row.toNextMilestone !== null && <> ・ あと{row.toNextMilestone}体で生産×2</>}
              </div>
            </div>
            <button
              className={styles.buyButton}
              disabled={!row.affordable}
              onClick={() => buy(row.id)}
            >
              雇う {row.cost}
            </button>
          </div>
        ),
      )}
    </div>
  );
}

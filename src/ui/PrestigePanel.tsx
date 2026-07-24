'use client';

import { useState } from 'react';
import { nekodamaGain, PRESTIGE_UNLOCK } from '@/game-core/formulas';
import { jsonEq, useGameStore, useGameValue } from '@/store/gameStore';
import { formatKoban } from './format';
import styles from './GameRoot.module.css';
import { Modal } from './Modal';

interface View {
  lifetime: string;
  nekodama: string;
  nekodamaPct: string;
  unlocked: boolean;
  gain: string;
  canPrestige: boolean;
  /** 解放 or 次の+1猫玉までに必要な残り小判 */
  remaining: string;
}

/**
 * のれん分けタブ(GDD §8)。
 * 解放前は獲得予定を出さず解放条件の案内のみ。
 * ボタンは獲得予定 ≥ 1 のときのみ活性。確認ダイアログで失うものを明示し2タップで確定。
 */
export function PrestigePanel() {
  const view = useGameValue<View>((s) => {
    const st = s.state;
    const gain = nekodamaGain(st.lifetimeKoban, st.nekodama);
    const unlocked = st.lifetimeKoban.gte(PRESTIGE_UNLOCK);
    // 次の+1猫玉(理論総数+1)に必要な累計: (n+1)^2 × 1e6
    const nextTotal = st.nekodama.add(gain).add(1);
    const nextThreshold = nextTotal.sqr().mul(PRESTIGE_UNLOCK);
    const remaining = unlocked
      ? nextThreshold.sub(st.lifetimeKoban)
      : PRESTIGE_UNLOCK.sub(st.lifetimeKoban);
    return {
      lifetime: formatKoban(st.lifetimeKoban),
      nekodama: formatKoban(st.nekodama),
      nekodamaPct: formatKoban(st.nekodama.mul(10)),
      unlocked,
      gain: formatKoban(gain),
      canPrestige: gain.gte(1),
      remaining: formatKoban(remaining, 'ceil'),
    };
  }, jsonEq);
  const prestige = useGameStore((s) => s.prestige);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className={styles.prestigeBox}>
      <p>
        店を弟子に譲って一から出直すと、これまでの繁盛に応じて<strong>猫玉</strong>を獲得します。
        猫玉1個につき全生産 <strong>+10%</strong>(永続)。
      </p>
      <p>
        累計獲得小判: {view.lifetime}
        <br />
        所持猫玉: {view.nekodama}(生産 +{view.nekodamaPct}%)
        {view.unlocked ? (
          <>
            <br />
            獲得予定: <strong>{view.gain} 猫玉</strong>
            <br />
            <small>あと {view.remaining} 小判で +1 猫玉</small>
          </>
        ) : (
          <>
            <br />
            <small>
              累計 {formatKoban(PRESTIGE_UNLOCK)} 小判で解放(あと {view.remaining} 小判)
            </small>
          </>
        )}
      </p>
      <button
        className={styles.prestigeButton}
        disabled={!view.canPrestige}
        onClick={() => setConfirming(true)}
      >
        のれん分けする
      </button>

      {confirming && (
        <Modal title="のれん分けの確認">
          <p>
            <strong>{view.gain} 猫玉</strong> を獲得して最初からやり直します。
          </p>
          <p>失うもの: 小判・ねこ店員・マイルストーン・タップ強化</p>
          <p>残るもの: 猫玉・累計獲得小判などの統計</p>
          <div className={styles.modalActions}>
            <button
              className={styles.dangerLink}
              onClick={() => {
                prestige();
                setConfirming(false);
              }}
            >
              のれん分けする
            </button>
            <button className={styles.modalPrimary} onClick={() => setConfirming(false)}>
              やめる
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

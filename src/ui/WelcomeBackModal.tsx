'use client';

import { useGameStore } from '@/store/gameStore';
import { formatDuration, formatKoban } from './format';
import styles from './GameRoot.module.css';
import { Modal } from './Modal';

/** オフライン収益の受取モーダル(GDD §7) */
export function WelcomeBackModal() {
  const welcomeBack = useGameStore((s) => s.welcomeBack);
  const dismiss = useGameStore((s) => s.dismissWelcomeBack);
  if (!welcomeBack) return null;

  return (
    <Modal title="おかえりなさい!">
      <p>
        お留守の間({formatDuration(welcomeBack.creditedSec)})に
        <br />
        <strong>{formatKoban(welcomeBack.gained)} 小判</strong> 貯まりました🐾
      </p>
      <div className={styles.modalActions}>
        <button className={styles.modalPrimary} onClick={dismiss}>
          受け取る
        </button>
      </div>
    </Modal>
  );
}

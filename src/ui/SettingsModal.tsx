'use client';

import { useState } from 'react';
import { resetSession } from '@/store/session';
import styles from './GameRoot.module.css';
import { Modal } from './Modal';

/**
 * 設定(GDD §11: 手動リセット)。リセットは二段確認。
 * 破壊操作は控えめな導線(dangerLink)に置き、肯定位置(右の大ボタン)には
 * 常に安全な選択肢を置く。
 */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [confirmingReset, setConfirmingReset] = useState(false);

  if (confirmingReset) {
    return (
      <Modal title="本当にリセットしますか?">
        <p>すべての進行状況(小判・店員・猫玉・統計)が削除されます。元に戻せません。</p>
        <div className={styles.modalActions}>
          <button
            className={styles.dangerLink}
            onClick={() => {
              resetSession(window.localStorage, Date.now());
              onClose();
            }}
          >
            削除する
          </button>
          <button className={styles.modalPrimary} onClick={() => setConfirmingReset(false)}>
            やめる
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="設定">
      <p>ねこ茶屋 〜まったり放置経営〜(テスト版)</p>
      <div className={styles.modalActions}>
        <button className={styles.modalPrimary} onClick={onClose}>
          閉じる
        </button>
      </div>
      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <button className={styles.dangerLink} onClick={() => setConfirmingReset(true)}>
          データを全リセット…
        </button>
      </div>
    </Modal>
  );
}

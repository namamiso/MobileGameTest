'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import styles from './GameRoot.module.css';

/**
 * 最小限のフォーカス管理付きモーダル: 開いたら本体へフォーカスを移し、
 * 閉じたら元の要素へ戻す(背面の購入ボタン等への誤操作を防ぐ)。
 */
export function Modal({ title, children }: { title: string; children: ReactNode }) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    bodyRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label={title}>
      <div className={styles.modal} ref={bodyRef} tabIndex={-1}>
        <div className={styles.modalTitle}>{title}</div>
        {children}
      </div>
    </div>
  );
}

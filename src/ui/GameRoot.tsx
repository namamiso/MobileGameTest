'use client';

import { useEffect, useState } from 'react';
import { useGameLoop } from '@/loop/useGameLoop';
import { useGameStore } from '@/store/gameStore';
import {
  autosaveTick,
  bootSession,
  handleExternalSaveChange,
  handleHidden,
  handlePageHide,
  handleVisible,
  heartbeatTick,
} from '@/store/session';
import { SAVE_KEY } from '@/store/persistence';
import { HEARTBEAT_MS, LOCK_KEY } from '@/store/tabLock';
import styles from './GameRoot.module.css';
import { GeneratorList } from './GeneratorList';
import { Hud } from './Hud';
import { Modal } from './Modal';
import { PrestigePanel } from './PrestigePanel';
import { SettingsModal } from './SettingsModal';
import { TapArea } from './TapArea';
import { UpgradeList } from './UpgradeList';
import { WelcomeBackModal } from './WelcomeBackModal';

const AUTOSAVE_MS = 10_000;

/** イベント・タイマーを session.ts のロジックへ配線する(TECH_DESIGN §4, §8, §9) */
function useGameSession(): void {
  useEffect(() => {
    const storage = window.localStorage;
    const tabId = crypto.randomUUID();

    bootSession(storage, tabId, Date.now());

    const heartbeatTimer = setInterval(
      () => heartbeatTick(storage, tabId, Date.now()),
      HEARTBEAT_MS,
    );
    const autosaveTimer = setInterval(
      () => autosaveTick(storage, Date.now(), document.visibilityState === 'hidden'),
      AUTOSAVE_MS,
    );

    const onStorage = (e: StorageEvent) => {
      if (e.key === LOCK_KEY) heartbeatTick(storage, tabId, Date.now());
      else if (e.key === SAVE_KEY) handleExternalSaveChange(storage, Date.now());
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        handleHidden(storage, Date.now());
      } else {
        // 先にリーダー状態を確定させてから精算する(stale リーダー対策)
        heartbeatTick(storage, tabId, Date.now());
        handleVisible(storage, Date.now());
      }
    };
    const onPageHide = () => handlePageHide(storage, tabId, Date.now());

    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      clearInterval(heartbeatTimer);
      clearInterval(autosaveTimer);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      handlePageHide(storage, tabId, Date.now());
    };
  }, []);
}

type Tab = 'staff' | 'upgrade' | 'prestige';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'staff', label: '店員' },
  { id: 'upgrade', label: '強化' },
  { id: 'prestige', label: 'のれん分け' },
];

export default function GameRoot() {
  useGameSession();
  const ready = useGameStore((s) => s.ready);
  const isLeader = useGameStore((s) => s.isLeader);
  useGameLoop(ready && isLeader);

  const corruptNotice = useGameStore((s) => s.corruptNotice);
  const dismissCorruptNotice = useGameStore((s) => s.dismissCorruptNotice);
  const welcomeBackOpen = useGameStore((s) => s.welcomeBack !== null);
  const [tab, setTab] = useState<Tab>('staff');
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!ready) {
    return <div className={styles.centerNote}>読み込み中…</div>;
  }

  if (!isLeader) {
    return (
      <div className={styles.centerNote}>
        <span style={{ fontSize: '3rem' }}>🐈</span>
        <strong>別のタブでプレイ中です</strong>
        <span>このタブは停止しています。もう一方のタブを閉じると再開できます。</span>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <Hud onOpenSettings={() => setSettingsOpen(true)} />
      <TapArea />
      <nav className={styles.tabs}>
        <div className={styles.tabBar} role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              role="tab"
              aria-selected={tab === t.id}
              aria-controls="tabpanel"
              className={tab === t.id ? styles.tabButtonActive : styles.tabButton}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div id="tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} className={styles.tabBody}>
          {tab === 'staff' && <GeneratorList />}
          {tab === 'upgrade' && <UpgradeList />}
          {tab === 'prestige' && <PrestigePanel />}
        </div>
      </nav>

      {/* モーダルは常に1枚だけ(優先度: 破損通知 > おかえり > 設定)。
          PrestigePanel 内の確認ダイアログのみローカル管理(ユーザー起点の一時UI) */}
      {corruptNotice ? (
        <Modal title="セーブデータを初期化しました">
          <p>
            セーブデータが破損していたため、新しく始めています。
            破損したデータは調査用に退避してあります。
          </p>
          <div className={styles.modalActions}>
            <button className={styles.modalPrimary} onClick={dismissCorruptNotice}>
              OK
            </button>
          </div>
        </Modal>
      ) : (
        <WelcomeBackModal />
      )}
      {!corruptNotice && !welcomeBackOpen && settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

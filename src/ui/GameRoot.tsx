'use client';

import { useEffect } from 'react';
import { GENERATORS } from '@/game-core/data/generators';
import { UPGRADES } from '@/game-core/data/upgrades';
import { isGeneratorUnlocked, nextUpgradeId } from '@/game-core/actions';
import { generatorCost, nekodamaGain } from '@/game-core/formulas';
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
  resetSession,
} from '@/store/session';
import { SAVE_KEY } from '@/store/persistence';
import { HEARTBEAT_MS, LOCK_KEY } from '@/store/tabLock';

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

/** フェーズ3のデバッグUI。フェーズ4で本UIに置き換える */
export default function GameRoot() {
  useGameSession();
  const ready = useGameStore((s) => s.ready);
  const isLeader = useGameStore((s) => s.isLeader);
  useGameLoop(ready && isLeader);

  const state = useGameStore((s) => s.state);
  const welcomeBack = useGameStore((s) => s.welcomeBack);
  const corruptNotice = useGameStore((s) => s.corruptNotice);
  const store = useGameStore.getState();

  if (!ready) return <main style={{ padding: 16 }}>読み込み中…</main>;

  if (!isLeader) {
    return (
      <main style={{ padding: 16 }}>
        <h1>ねこ茶屋</h1>
        <p>別のタブでプレイ中です。このタブは停止しています。</p>
      </main>
    );
  }

  const prestigeGain = nekodamaGain(state.lifetimeKoban, state.nekodama);

  return (
    <main style={{ padding: 16, fontFamily: 'monospace' }}>
      <h1>ねこ茶屋(デバッグUI)</h1>
      {corruptNotice && (
        <p style={{ color: 'red' }}>
          セーブデータが破損していたため初期化しました(元データは退避済み)
          <button onClick={() => store.dismissCorruptNotice()}>OK</button>
        </p>
      )}
      {welcomeBack && (
        <p style={{ background: '#ffe' }}>
          おかえりなさい!{welcomeBack.gained.toString()} 小判 貯まりました(
          {Math.round(welcomeBack.creditedSec)}秒分)
          <button onClick={() => store.dismissWelcomeBack()}>受け取る</button>
        </p>
      )}
      <p>小判: {state.koban.toString()}</p>
      <p>生産: {state.derived.prodPerSec.toString()}/秒</p>
      <p>
        累計: {state.lifetimeKoban.toString()} / 猫玉: {state.nekodama.toString()} / 転生:
        {state.prestigeCount}回 / タップ: {state.totalTaps}回
      </p>
      <p>
        <button onClick={() => store.tap(performance.now())} style={{ fontSize: 24, padding: 12 }}>
          タップ(+{state.derived.tapGain.toString()})
        </button>
      </p>
      <h2>店員</h2>
      {GENERATORS.map((def, i) => {
        const owned = state.generators[i].owned;
        const unlocked = isGeneratorUnlocked(state, i);
        // 解放済み+次の1種(???)のみ表示(GDD §4)
        if (!unlocked && !(i > 0 && isGeneratorUnlocked(state, i - 1))) return null;
        const cost = generatorCost(def, owned);
        return (
          <p key={def.id}>
            {unlocked ? def.name : '???'} ×{owned}{' '}
            <button
              disabled={!unlocked || state.koban.lt(cost)}
              onClick={() => store.buyGenerator(def.id)}
            >
              雇う ({cost.toString()})
            </button>
          </p>
        );
      })}
      <h2>強化</h2>
      {UPGRADES.map((u) => (
        <p key={u.id}>
          {u.name}{' '}
          {state.upgrades.includes(u.id) ? (
            '購入済み'
          ) : (
            <button
              disabled={nextUpgradeId(state) !== u.id || state.koban.lt(u.cost)}
              onClick={() => store.buyUpgrade(u.id)}
            >
              購入 ({u.cost.toString()})
            </button>
          )}
        </p>
      ))}
      <h2>のれん分け</h2>
      <p>
        獲得予定: {prestigeGain.toString()} 猫玉{' '}
        <button disabled={prestigeGain.lt(1)} onClick={() => store.prestige()}>
          のれん分け
        </button>
      </p>
      <p>
        <button onClick={() => resetSession(window.localStorage, Date.now())}>全リセット</button>
      </p>
    </main>
  );
}

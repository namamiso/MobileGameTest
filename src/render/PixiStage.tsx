'use client';

import { Application } from 'pixi.js';
import { useEffect, useRef } from 'react';
import { GENERATORS } from '@/game-core/data/generators';
import { useGameStore } from '@/store/gameStore';
import { formatKoban } from '@/ui/format';
import styles from '@/ui/GameRoot.module.css';
import { TeaHouseScene } from './scene/TeaHouseScene';

/**
 * PIXI.Application の React ラッパー(TECH_DESIGN §10)。
 * - app.init() は Promise<void>(Application を返さない)。app はクロージャで持つ
 * - StrictMode の mount→cleanup→mount に耐える: cancelled フラグ+
 *   「init 完了を待ってから destroy」。init 失敗時は renderer 未生成のため
 *   app.destroy() を呼ばず stage だけ破棄する
 * - resizeTo: HTMLElement は window.resize しか監視しないため、
 *   flex 子のサイズ変化(HUD の高さ変動等)は ResizeObserver で補う
 */
export function PixiStage() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const app = new Application();
    let cancelled = false;
    let destroyed = false;
    let cleanupScene: (() => void) | null = null;

    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      cleanupScene?.();
      cleanupScene = null;
      if (app.renderer) {
        app.destroy({ removeView: true }, { children: true });
      } else {
        app.stage.destroy({ children: true });
      }
    };

    const initPromise = app.init({
      resizeTo: host,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      background: '#e8d8b8',
      antialias: true,
    });

    void initPromise
      .then(() => {
        if (cancelled) {
          destroy();
          return;
        }
        host.appendChild(app.canvas);
        app.canvas.style.display = 'block';
        app.canvas.style.touchAction = 'none'; // ダブルタップズーム対策(TECH §7)

        const scene = new TeaHouseScene(app.ticker, GENERATORS.length, {
          onTap: () => useGameStore.getState().tap(performance.now()),
          getTapGainText: () => formatKoban(useGameStore.getState().state.derived.tapGain),
        });
        app.stage.addChild(scene.root);

        const layout = () => scene.resize(app.screen.width, app.screen.height);
        app.renderer.on('resize', layout);
        layout();

        const observer = new ResizeObserver(() => {
          const w = host.clientWidth;
          const h = host.clientHeight;
          if (w > 0 && h > 0 && (w !== app.screen.width || h !== app.screen.height)) {
            app.renderer.resize(w, h);
          }
        });
        observer.observe(host);

        // owned のみ購読して差分反映(TECH_DESIGN §6)
        const unsubscribe = useGameStore.subscribe(
          (s) => s.state.generators.map((g) => `${g.id}:${g.owned}`).join('|'),
          () => scene.setOwned(useGameStore.getState().state.generators.map((g) => g.owned)),
          { fireImmediately: true },
        );

        cleanupScene = () => {
          unsubscribe();
          observer.disconnect();
          app.renderer.off('resize', layout);
          scene.destroy();
        };
      })
      .catch((error: unknown) => {
        destroy();
        if (!cancelled) console.error('Pixi の初期化に失敗しました', error);
      });

    return () => {
      cancelled = true;
      void initPromise.then(destroy, destroy);
    };
  }, []);

  const keyboardTap = () => {
    useGameStore.getState().tap(performance.now());
  };

  return (
    <div ref={hostRef} className={styles.stage}>
      {/* キーボード・スクリーンリーダー向けの代替タップ手段 */}
      <button className={styles.srOnly} onClick={keyboardTap}>
        タップで小判を稼ぐ
      </button>
    </div>
  );
}

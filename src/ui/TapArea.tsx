'use client';

import { useRef, useState } from 'react';
import { useGameStore, useGameValue } from '@/store/gameStore';
import { formatKoban } from './format';
import styles from './GameRoot.module.css';

interface FloatItem {
  id: number;
  x: number;
  y: number;
  text: string;
}

/**
 * フェーズ4の仮タップ領域。フェーズ5で PixiJS の茶屋シーンに置き換える。
 * pointerdown 単位で付与(レート制限 15回/秒 は store 側)。
 * マルチタッチは isPrimary のみ判定(GDD §5「同時1点のみ」)。
 * レート制限超過時はフロートを出さず、押下演出(:active)だけ返す。
 */
export function TapArea() {
  const tapGainText = useGameValue((s) => formatKoban(s.state.derived.tapGain));
  const [floats, setFloats] = useState<FloatItem[]>([]);
  const nextId = useRef(0);

  const doTap = (x: number, y: number) => {
    const granted = useGameStore.getState().tap(performance.now());
    if (!granted) return;
    const id = nextId.current++;
    const text = `+${formatKoban(useGameStore.getState().state.derived.tapGain)}`;
    setFloats((f) => [...f.slice(-9), { id, x, y, text }]);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!e.isPrimary) return;
    const rect = e.currentTarget.getBoundingClientRect();
    doTap(e.clientX - rect.left, e.clientY - rect.top);
  };

  // キーボード操作(Enter/Space)。click イベントの detail=0 がキーボード発火
  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.detail !== 0) return; // ポインタ経路は onPointerDown 済み(二重付与防止)
    const rect = e.currentTarget.getBoundingClientRect();
    doTap(rect.width / 2, rect.height / 2);
  };

  return (
    <div className={styles.stage}>
      <button
        className={styles.tapArea}
        onPointerDown={onPointerDown}
        onClick={onClick}
        aria-label="タップで小判を稼ぐ"
      >
        <span className={styles.tapCat}>🐈</span>
        タップで +{tapGainText} 小判
      </button>
      {floats.map((f) => (
        <span
          key={f.id}
          className={styles.tapFloat}
          style={{ left: f.x, top: f.y }}
          onAnimationEnd={() => setFloats((cur) => cur.filter((it) => it.id !== f.id))}
        >
          {f.text}
        </span>
      ))}
    </div>
  );
}

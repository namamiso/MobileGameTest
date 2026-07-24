'use client';

import dynamic from 'next/dynamic';

// ゲーム本体はブラウザ専用(localStorage / rAF / Pixi)のため SSR を無効化する
const GameRoot = dynamic(() => import('@/ui/GameRoot'), { ssr: false });

export default function Page() {
  return <GameRoot />;
}

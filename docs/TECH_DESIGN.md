# ねこ茶屋 技術設計書

- バージョン: 0.1(テスト用初版)
- 前提: 仕様は `GDD.md` を参照

## 1. 技術スタック

| 領域 | 採用技術 | 理由 |
|------|---------|------|
| フレームワーク | Next.js 15(App Router) | 指定。UI・ルーティング・ビルド基盤 |
| 描画 | PixiJS v8 | 指定。茶屋シーンとねこアニメーションを WebGL で描画 |
| 言語 | TypeScript(strict) | 数式・セーブデータの型安全性 |
| 状態管理 | zustand | React 外(Pixi・ゲームループ)からも読み書きしやすい |
| 大数 | break_infinity.js(Decimal) | 放置ゲームの指数的インフレに対応。JSON へは文字列で保存 |
| テスト | vitest | game-core(純ロジック)の単体テスト |

ゲームは実質 1 ページの SPA。Next.js のサーバー機能は使わず、ゲーム本体はすべて
クライアントコンポーネント(`ssr: false` の dynamic import)で動かす。

## 2. レイヤー構成(最重要方針)

**シミュレーション・描画・UI を完全分離する。** game-core は React にも Pixi にも依存しない
純粋な TypeScript にし、テスト可能かつ移植可能に保つ。

```
┌──────────────────────────────┐
│ ui/        React コンポーネント(HUD、店員リスト、モーダル)   │
│              zustand ストアを購読して表示・操作             │
├──────────────────────────────┤
│ render/    PixiJS シーン(茶屋、ねこスプライト、小判演出)    │
│              ストアを購読して表示を同期。状態は一切持たない     │
├──────────────────────────────┤
│ store/     zustand ストア = GameState の唯一の置き場       │
│              アクション(buy, tap, prestige)はここ経由      │
├──────────────────────────────┤
│ game-core/ 純 TS。GameState 型、advance(state, dt)、     │
│              数式、オフライン計算、セーブのシリアライズ/移行     │
└──────────────────────────────┘
```

依存方向は上から下への一方向のみ。game-core は誰にも依存しない。

## 3. ディレクトリ構成

```
src/
├── app/
│   ├── layout.tsx
│   └── page.tsx              # GameRoot を dynamic import (ssr: false)
├── game-core/
│   ├── types.ts              # GameState, GeneratorState など
│   ├── data/generators.ts    # 店員マスタ(GDD §4 の表をデータ化)
│   ├── formulas.ts           # コスト・生産・猫玉の数式(全て純関数)
│   ├── advance.ts            # advance(state, dtSec): GameState
│   ├── actions.ts            # buyGenerator, tap, prestige(純関数)
│   ├── offline.ts            # applyOfflineProgress(state, now)
│   └── save/
│       ├── serialize.ts      # GameState ⇔ JSON(Decimal は文字列化)
│       └── migrate.ts        # version 付きマイグレーション
├── store/
│   ├── gameStore.ts          # zustand。state + アクションのラッパー
│   └── persistence.ts        # localStorage 読み書き、autosave、visibilitychange
├── loop/
│   └── useGameLoop.ts        # rAF + 固定タイムステップで advance を回す
├── render/
│   ├── PixiStage.tsx         # PIXI.Application の React ラッパー(mount/destroy)
│   ├── scene/TeaHouseScene.ts# 背景・ねこ配置・タップ判定
│   └── scene/CoinEmitter.ts  # 小判が跳ねるパーティクル
└── ui/
    ├── Hud.tsx               # 所持小判・毎秒生産
    ├── GeneratorList.tsx     # 店員タブ(購入ボタン)
    ├── PrestigePanel.tsx     # のれん分けタブ
    ├── WelcomeBackModal.tsx  # オフライン収益受取
    └── format.ts             # 万億兆表記フォーマッタ
```

## 4. ゲームループ

固定タイムステップ + アキュムレータ方式。描画は rAF 任せ、シミュレーションは 10 tick/秒。

```ts
const TICK = 0.1; // 秒
let acc = 0, last = performance.now();
function frame(now: number) {
  acc += (now - last) / 1000; last = now;
  acc = Math.min(acc, 1);              // タブ復帰直後のスパイク防止
  while (acc >= TICK) { store.advance(TICK); acc -= TICK; }
  requestAnimationFrame(frame);
}
```

- `advance` は `GameState` を受け取り新しい状態を返す純関数。副作用なし
- 長時間の非アクティブ(タブ復帰・起動時)は tick を回さず `applyOfflineProgress` で
  一括計算する(経過時間 × 生産/秒 × 0.5、上限8時間)。ループで追いつかせない

## 5. 状態と描画の同期

- Pixi 側はストアを `subscribe` し、差分だけシーンに反映する
  (例: 店員数が変わったらスプライトを追加、小判残高は Pixi では扱わない)
- タップは Pixi のヒット判定 → ストアの `tap()` アクションを呼ぶ。演出はその場で再生
- React UI は通常の zustand セレクタで購読。毎 tick 変わる数値(所持小判)は
  HUD コンポーネントに閉じ込め、再レンダリング範囲を最小化する

## 6. セーブデータ

```ts
interface SaveData {
  version: 1;
  savedAt: number;              // epoch ms — オフライン計算の基準
  koban: string;                // Decimal を文字列化
  lifetimeKoban: string;
  nekodama: number;
  generators: { id: string; owned: number }[];
}
```

- 書き込み: 10秒間隔の autosave + `visibilitychange`(hidden 時)
- 読み込み: 起動時に `migrate()` → `applyOfflineProgress()` → ストア初期化
- マイグレーションは `version` の switch 文で段階適用。不正データは初期状態にフォールバック

## 7. テスト方針

game-core のみを vitest で単体テストする(描画・UI はテスト版では目視確認)。

- formulas: コスト成長、マイルストーン倍率、猫玉計算の境界値
- offline: 8時間クランプ、50%係数、savedAt が未来(時計改ざん)のとき 0 扱い
- save: serialize → deserialize のラウンドトリップ、旧バージョンからの migrate

## 8. 主要リスクと対策

| リスク | 対策 |
|--------|------|
| Decimal 演算を毎 tick 全店員分行う負荷 | 生産/秒の合計をキャッシュし、購入・強化時のみ再計算 |
| Pixi と React のライフサイクル競合 | PixiStage が単独で Application を所有し、unmount で確実に destroy |
| モバイルの省電力で rAF が止まる | 止まって良い設計(復帰時にオフライン計算が吸収する) |
| localStorage 容量・破損 | セーブは数KB。parse 失敗時は初期化+ユーザーに通知 |

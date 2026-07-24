# ねこ茶屋 技術設計書

- バージョン: 0.2(設計レビュー反映版 — 曖昧箇所の明確化のみ。構成方針の変更なし)
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
│   ├── data/upgrades.ts      # タップ強化マスタ(GDD §6 の表をデータ化)
│   ├── formulas.ts           # コスト・生産・猫玉の数式(全て純関数)
│   ├── derived.ts            # recomputeDerived(state)(§5 参照)
│   ├── advance.ts            # advance(state, dtSec): GameState
│   ├── actions.ts            # buyGenerator, buyUpgrade, tap, prestige(純関数)
│   ├── offline.ts            # applyOfflineProgress(state, now)
│   ├── initial.ts            # createInitialState(now)
│   └── save/
│       ├── serialize.ts      # GameState ⇔ JSON(Decimal は文字列化)
│       └── migrate.ts        # version 付きマイグレーション
├── store/
│   ├── gameStore.ts          # zustand。state + アクションのラッパー
│   ├── persistence.ts        # localStorage 読み書き、autosave、visibilitychange
│   └── tabLock.ts            # アクティブタブロック(§8 参照)
├── loop/
│   └── useGameLoop.ts        # rAF + 固定タイムステップで advance を回す
├── render/
│   ├── PixiStage.tsx         # PIXI.Application の React ラッパー(mount/destroy)
│   ├── scene/TeaHouseScene.ts# 背景・ねこ配置・タップ判定
│   └── scene/CoinEmitter.ts  # 小判が跳ねるパーティクル
└── ui/
    ├── GameRoot.tsx          # エントリ。ストア初期化・ループ起動と各パネルの合成
    ├── Hud.tsx               # 所持小判・毎秒生産
    ├── GeneratorList.tsx     # 店員タブ(購入ボタン)
    ├── UpgradeList.tsx       # 強化タブ
    ├── PrestigePanel.tsx     # のれん分けタブ(確認ダイアログ含む)
    ├── WelcomeBackModal.tsx  # オフライン収益受取
    └── format.ts             # 万億兆表記フォーマッタ(§12 参照)
```

## 4. ゲームループと時刻の原則

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

**時刻の使い分け(原則)**: セッション内の dt 計測は `performance.now` のみ、
セーブ(`savedAt`)とオフライン計算は `Date.now`(epoch ms)のみを使う。混用しない。

**非アクティブからの復帰**(visibilitychange の visible 時、および起動時)は tick で
追いつかせず、hidden からの経過時間で分岐する:

- 経過 **60秒未満**: 効率100%で経過分を一括加算(`advance` 相当の一括計算)。モーダルなし
- 経過 **60秒以上**: `applyOfflineProgress`(`min(elapsed, 8h) × 生産/秒 × 0.5`、
  クランプが先)。獲得1小判以上ならモーダル表示
- `savedAt > now`(時計巻き戻し)は `elapsed = max(0, now − savedAt)` により収益0。
  `savedAt` は `max(savedAt, now)` で単調非減少を保ち(巻き戻さない)、
  時計往復による反復取得を防ぐ。保存時(persistence)も同じ max 規則を適用する
- **visible 復帰時、ループは accumulator を破棄する**(精算は復帰分岐が担う。
  tick で追いつかせると二重加算になる)
- **サスペンド検出**: 蓋閉じ等では visibilitychange なしで rAF が止まる。ループは
  フレーム間の壁時計ギャップ(>5秒)を監視し、超過時は tick せず
  「最後にフレームが動いた時刻」を基準にオフライン規則で精算する。
  ループ内の壁時計(Date.now)参照はこのギャップ検出・精算基準にのみ使う

## 5. 派生値キャッシュ(純関数方針との両立)

生産/秒を毎 tick 全店員分 Decimal で畳み込むのは無駄なので、派生値は GameState 内に
非永続フィールドとして持つ。

```ts
interface GameState {
  ...
  derived: { prodPerSec: Decimal; tapGain: Decimal };  // 保存対象外
}
```

- `recomputeDerived(state): GameState` を game-core に置き、呼び出し箇所を
  **buy / buyUpgrade / prestige / ロード直後 / migrate 後** に限定する
- `advance` と `tap` は `derived` を読むだけで再計算しない
- `serialize` は `derived` を除外し、`deserialize` 後に必ず `recomputeDerived` を通す

## 6. 状態と描画の同期

- `advance` は **構造共有** を徹底する: 変化したフィールドだけ差し替え、`generators` 配列など
  変化のない部分は参照を維持する(毎 tick の全再生成による GC 負荷と無駄な再レンダリングを防ぐ)
- React UI は zustand セレクタでプリミティブ or Decimal 単体を購読し、Decimal には
  `(a, b) => a.eq(b)` のカスタム equality を渡す。毎 tick 変わる数値(所持小判)は
  HUD コンポーネントに閉じ込める
- Pixi 側は `subscribeWithSelector` で各店員の `owned` のみ購読し、差分だけシーンに反映する
  (小判残高は Pixi では扱わない)
- **ストアの全アクションは `set(prev => …)` の関数型アップデータのみ使用する**。
  zustand は同期実行のため、これで Pixi イベントハンドラ発の `tap()` と tick の排他が成立する
  (古い state のキャプチャによる更新消失を防ぐ)

## 7. 入力(タップ)

- タップ対象スプライトは `eventMode: 'static'` + 明示的な `hitArea` を設定
  (Pixi v8 のデフォルトはヒットしない)
- React オーバーレイは背景を `pointer-events: none`、ボタン類のみ `auto` にして
  キャンバスのタップを妨げない
- canvas に `touch-action: none`、ページ全体に `touch-action: manipulation`
  (ダブルタップズーム・300ms遅延対策)
- タップ収入の付与は `pointerdown` 単位で最大15回/秒(GDD §5)。超過は演出のみ

## 8. マルチタブ対策(アクティブタブロック)

同一セーブを複数タブで開くと二重シミュレーションと autosave の上書き合戦が起きるため、
`tabLock.ts` で単一アクティブタブを保証する。

- localStorage にタブID+ハートビート時刻を書く(2秒間隔、5秒でタイムアウト)。
  check-then-set は非アトミックなので、書き込み直後に読み戻して勝者を確定する
- ロックを持つタブだけが精算(オフライン適用)・ゲームループ・保存を実行。
  起動時も **ロック取得 → ロード** の順(取得前に書かない)。非リーダータブは
  精算なしの表示用ロードのみ行い、「別のタブでプレイ中です」を表示して停止する
- **非リーダー → リーダー昇格時は localStorage のセーブを再ロードして再初期化する**
  (凍結中の古い in-memory state で再開すると旧リーダーの進捗を巻き戻すため)
- 保存時は既存セーブの `savedAt` と **自分の透かし(state.savedAt)** を比較し、
  既存の方が新しければ上書きしない(比較に now を混ぜるとガードが無効化される)
- セーブキーの `storage` イベントも監視し、非リーダーは表示 state を追従させる。
  visible 復帰時はハートビートでリーダー状態を確定させてから精算する

## 9. セーブデータ

```ts
interface SaveData {
  version: 1;
  savedAt: number;              // epoch ms — オフライン計算の基準
  koban: string;                // Decimal を文字列化
  lifetimeKoban: string;        // 全期間累計。転生を跨いで保持(猫玉式の入力)
  nekodama: string;             // Decimal(number だと lifetime ≈ 1e616 超で溢れる)
  generators: { id: string; owned: number }[];
  upgrades: string[];           // 購入済みタップ強化ID。転生で空になる
  prestigeCount: number;        // 統計(GDD §12)
  totalTaps: number;
  startedAt: number;            // epoch ms
}
```

- マイルストーン倍率は `owned` からの純導出であり **保存しない**(GDD §4)
- `globalMult`・`tapMult` も保存せず、猫玉と upgrades から毎回導出する

### シリアライズ仕様

- `serialize(state, now)` は保存時刻を引数に取り、`savedAt = max(state.savedAt, now)` を
  スタンプする(単調非減少規則を保存経路でも維持)
- Decimal は `Decimal.prototype.toString()` で文字列化、`new Decimal(str)` で復元。
  ラウンドトリップは vitest で保証する
- デシリアライズ時は構築**前**に文字列形式を検証する(break_infinity は 'Infinity' を
  有限ペアとして受理し、'1e9e9' を黙って誤パースするため)。構築後にも
  NaN / 指数上限(9e15)/ 負数を検証し、不正値は **フィールド単位で** 初期値に
  フォールバックする(セーブ全体は捨てない)
- `version` フィールドの欠落・非整数・未知の新バージョンは **破損扱い**
  (フィールド補完の対象外。判別子が無いデータは安全に補完できない)

### savedAt の意味(収益計上済み透かし)

- メモリ上の `savedAt` は「**この時刻までの収益は計上済み**」を表す透かしであり、
  永続化の成功時刻ではない。tick 収入は書き込みと無関係にメモリへ入るため、
  透かしは **保存の成否に関わらず** hidden・autosave・精算の各時点で
  max 規則により前進させる(進めないと復帰精算が同じ区間を二重加算する)
- **hidden 中は autosave しない**。rAF 停止中(生産が積まれていない)に透かしと
  保存の savedAt が前進すると、復帰時の精算区間が食い潰されて放置収益が全損する

### 読み書きフロー

- 書き込み: 10秒間隔の autosave(hidden 中は禁止)+ `visibilitychange`(hidden 時)。
  §8 のロック保持タブのみ
- 読み込み(起動時):
  1. セーブなし → `createInitialState(Date.now())` で開始。オフライン計算はスキップ
  2. セーブあり → `migrate()` → `deserialize()` → `recomputeDerived()` →
     `applyOfflineProgress()` → ストア初期化
- 破損時(JSON.parse 失敗など): 元の文字列を別キー(`nekochaya:save:corrupt-backup`)に
  退避してから初期化し、起動時モーダルで通知する
- `version` が既知より新しい場合(将来版からのロールバック)も破損と同扱い
- parse は通るがフィールド欠落の場合はデフォルト値で補完して正常続行
- マイグレーションは `version` の switch 文で段階適用

## 10. Pixi と React のライフサイクル

Pixi v8 の `app.init()` は async のため、React StrictMode の二重マウントと競合しやすい。
`PixiStage` は以下の手順を厳守する(Codex 相互検証で確定。議事録006):

- **`app.init()` は `Promise<void>`**(Application を返さない)。app は effect ローカルの
  クロージャで保持する。ref を再入ロックに使うと StrictMode 再実行時に空画面になるため不可
- effect 内で `cancelled` フラグと init Promise を保持。init 完了時に `cancelled` なら即 destroy
- cleanup は `initPromise.then(destroy, destroy)` で **必ず init 完了(または失敗)を
  待ってから** 破棄する
- **init 失敗時は renderer 未生成のため `app.destroy()` を呼ばない**
  (`renderer.destroy` で落ちる)。`app.stage.destroy({ children: true })` のみ行う
- destroy オプションは `({ removeView: true }, { children: true })`。
  `texture/textureSource` の破棄は共有テクスチャを壊すため指定しない
- **`resizeTo: HTMLElement` は window.resize しか監視しない**(ResizeObserver ではない)。
  flex 子のサイズ変化(HUD 高さ変動等)には host への ResizeObserver で
  `renderer.resize(w, h)` を呼んで追従する(同一サイズは除外)
- シーンの再レイアウトは `renderer.on('resize', …)` にフックし、
  座標は `app.screen.width/height`(論理ピクセル)を使う。hitArea もここで更新する。
  hitArea はほぼ全面だが、下端 20px はタブバー誤爆防止の不感帯として除外(議事録005)
- 演出(フロート・パーティクル・揺れ)は `app.ticker`。callback は同一参照で
  必ず remove し、シーン destroy で ticker・Pixi イベント・zustand 購読を全解除する

## 11. レイアウト・解像度

- `app.init({ resolution: Math.min(devicePixelRatio, 2), autoDensity: true, resizeTo: 親要素 })`
- ページは `100dvh` の flex 縦3段(HUD / canvas flex-1 / タブ)≒ GDD §9 の 10% / 50% / 40%。
  HUD は内容駆動の高さ(min 10%)、タブは 40% 固定、canvas が flex-1 で
  セーフエリア分のしわ寄せを吸収する
- HUD に `env(safe-area-inset-top)`、タブ領域に `env(safe-area-inset-bottom)` のパディング。
  `100dvh` の直前に `100vh` フォールバックを置く
- シーンは resize イベントで論理座標を再レイアウト(画面回転・アドレスバー伸縮に追従)
- viewport 方針: `maximumScale: 1` + `userScalable: false` + `viewportFit: 'cover'` で
  ピンチズームを無効化する(ゲーム画面として固定。`touch-action` 対策 §7 と併用)

## 12. 数値フォーマッタ(format.ts)

- 万〜無量大数(1e4〜1e68、4桁刻み)の単位表を定義。範囲内は「有効3桁+単位」
  (例: `1.23万`、`12.3億`。単位内整数部が4桁の帯のみ整数4桁 = `1234万`)。
  1e72 以上は `1.23e75` の指数表記にフォールバック
- 丸め: 残高・生産は切り捨て、コストは切り上げ(GDD §10)
- 実装は Decimal の `exponent` / `mantissa` を直接使い、`toNumber()` を経由しない
  (1e308 超で破綻するため)

## 13. テスト方針

game-core のみを vitest で単体テストする(描画・UI はテスト版では目視確認)。

- formulas: コスト成長、マイルストーン倍率(10/25/50/100 境界)、猫玉計算
  (獲得0クランプ、所持数との差分)の境界値
- offline: 8時間クランプが50%係数より先であること、60秒閾値の前後、
  savedAt が未来のとき収益0+savedAt上書き
- save: serialize → deserialize のラウンドトリップ、旧バージョンからの migrate、
  フィールド欠落時の補完、破損時のフォールバック
- format: 9999→1万の境界、単位境界、1e68〜1e72 の切替、切り捨て/切り上げの方向

## 14. 主要リスクと対策

| リスク | 対策 |
|--------|------|
| Decimal 演算を毎 tick 全店員分行う負荷 | 派生値キャッシュ(§5)。購入・強化・転生・ロード時のみ再計算 |
| 毎 tick の状態再生成による GC・再レンダリング | 構造共有+セレクタ購読+Decimal カスタム equality(§6) |
| Pixi と React のライフサイクル競合 | init Promise を待ってから destroy(§10) |
| マルチタブの二重実行・セーブ競合 | アクティブタブロック(§8) |
| モバイルの省電力で rAF が止まる | 止まって良い設計(復帰時に §4 の一括計算が吸収する) |
| localStorage 容量・破損 | セーブは数KB。破損時は退避+初期化+通知(§9) |

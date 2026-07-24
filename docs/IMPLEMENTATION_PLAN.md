# ねこ茶屋 実装計画

- バージョン: 0.1
- 前提: `GDD.md` v0.2 / `TECH_DESIGN.md` v0.2
- 方針: 依存の少ない下層(game-core)から積み上げ、**各フェーズの終わりに必ず動くもの・
  検証できるものがある** 状態を保つ。描画(Pixi)は最後から2番目 — それまでは仮UIで遊べる

## フェーズ一覧

| フェーズ | 内容 | 完了時にできること |
|---------|------|------------------|
| 0 | プロジェクトセットアップ | dev サーバーとテストが走る |
| 1 | game-core: シミュレーション | 数式・アクションが全てテストで検証済み |
| 2 | game-core: セーブ・オフライン | 永続化ロジックがテストで検証済み |
| 3 | ストア・ゲームループ・永続化配線 | ブラウザで数値が増え、リロードしても残る |
| 4 | React UI 一式 | 仮タップボタンで全機能がプレイ可能 |
| 5 | PixiJS 描画 | ねこが表示され、キャンバスタップで遊べる |
| 6 | モバイル対応仕上げ・QA | 実機相当で一通り破綻なく遊べる |

各フェーズ完了時にコミット(フェーズ = PR 相当の単位)。

---

## フェーズ 0: プロジェクトセットアップ

**成果物**
- `create-next-app`(App Router / TypeScript strict / ESLint)
- 依存追加: `pixi.js` `zustand` `break_infinity.js` `vitest`
- `TECH_DESIGN.md` §3 のディレクトリ骨格(空ファイル・型だけの placeholder)
- `page.tsx` に `dynamic(() => import(GameRoot), { ssr: false })` の骨組み
- vitest 設定+サンプルテスト1本

**完了条件**: `npm run dev` で空ページ表示、`npm test` がグリーン、`npm run build` が通る

## フェーズ 1: game-core — シミュレーション(純ロジック)

React・Pixi・localStorage に一切触れない。TDD で進める価値が最も高い層。

**成果物**
- `types.ts`(GameState / derived / Decimal 型の別名)
- `data/generators.ts` `data/upgrades.ts`(GDD §4・§6 のマスタ)
- `formulas.ts`: コスト(1.15^owned)、マイルストーン(10/25/50/100)、
  globalMult(1 + 0.10×猫玉)、tapGain、猫玉獲得式
- `derived.ts`(recomputeDerived)/ `initial.ts`(createInitialState)
- `advance.ts`(構造共有を守る)/ `actions.ts`(buyGenerator / buyUpgrade / tap / prestige)

**テスト(TECH §13 のうち formulas 分)**
- コスト成長・マイルストーン境界(9→10体、24→25体 …)
- 猫玉: 獲得0クランプ、所持数との差分、転生後の lifetimeKoban 保持
- tap: 生産0時の下限×globalMult、tapMult 乗算
- advance: dt 比例、derived 未変更時の参照維持(構造共有)

**完了条件**: 上記テスト全グリーン。カバレッジは game-core の主要分岐を網羅

## フェーズ 2: game-core — セーブ・オフライン

**成果物**
- `save/serialize.ts`: SaveData v1(TECH §9)、Decimal 文字列化、
  フィールド単位バリデーション+フォールバック
- `save/migrate.ts`: version switch、未知の新バージョン=破損扱い、欠落補完
- `offline.ts`: `min(elapsed, 8h) × prod × 0.5`(クランプが先)、60秒閾値の判定材料を返す
  (100%経路/50%+モーダル経路/モーダル抑止 <1小判)、未来 savedAt の扱い

**テスト(TECH §13 の offline / save 分)**
- ラウンドトリップ、破損・欠落・不正値(NaN/Infinity/負数)
- 8hクランプと50%の適用順、59秒/60秒/61秒、savedAt 未来

**完了条件**: テスト全グリーン。この時点で game-core が仕様の全数値を実装済み

## フェーズ 3: ストア・ゲームループ・永続化の配線

初めてブラウザで動かすフェーズ。UI はデバッグ用の素の数値表示+ボタンで良い。

**成果物**
- `store/gameStore.ts`: zustand。全アクション `set(prev => …)` 関数型アップデータ、
  Decimal カスタム equality、subscribeWithSelector 導入
- `loop/useGameLoop.ts`: rAF + 固定タイムステップ(TICK 0.1s、acc クランプ 1s)
- `store/persistence.ts`: 起動フロー(セーブなし→initial / あり→migrate→deserialize→
  recomputeDerived→offline)、autosave 10s、visibilitychange 保存+復帰分岐(60秒閾値)
- `store/tabLock.ts`: ハートビートロック(2s/5s)、非リーダーの停止フラグ、
  新しい savedAt を上書きしない保存ガード
- デバッグページ: 所持小判・生産/秒の表示、tap / buy ×8 / prestige の素ボタン

**完了条件(手動確認)**
- 放置で小判が増える。購入で生産が上がる。リロードで復元される
- タブを閉じて再度開くとオフライン収益が計算される(60秒未満/以上の分岐)
- 2タブ目を開くと片方が「別のタブでプレイ中」で止まる

## フェーズ 4: React UI 一式

Pixi はまだ入れない。キャンバス予定領域に仮の「タップエリア」(div)を置き、
**このフェーズ完了時点でゲームとして一通り遊べる** ことをゴールにする。

**成果物**
- レイアウト: 100dvh flex 縦3段(10/50/40)、セーフエリア padding
- `ui/format.ts` + テスト(万〜無量大数、1e72 指数フォールバック、切り捨て/切り上げ)
- `Hud.tsx`(所持小判・生産/秒。再レンダリングをこの中に閉じ込める)
- `GeneratorList.tsx`(行仕様: 名前/所持数/合計生産/コスト、活性条件、段階解放+???行)
- `UpgradeList.tsx`(3段階、前段購入で解放)
- `PrestigePanel.tsx`(獲得予定数表示、gain≥1 で活性、確認ダイアログ2タップ)
- `WelcomeBackModal.tsx`、設定(手動リセット)、セーブ破損通知モーダル
- タップレート制限 15回/秒(超過は収入0)

**完了条件(手動確認)**: 新規開始→購入→強化→転生→2周目、の一連をUIだけで完走できる。
format テストがグリーン

## フェーズ 5: PixiJS 描画

**成果物**
- `PixiStage.tsx`: async init と StrictMode 対策(cancelled フラグ、init 完了待ち destroy、
  ref 再入防止)、`resolution: min(dpr,2)` / autoDensity / resizeTo
- `TeaHouseScene.ts`: 背景、店員ねこ(1種最大5体、×N バッジ)、owned 購読での差分反映、
  色違いプレースホルダーアセット
- タップ判定: `eventMode: 'static'` + hitArea、`touch-action` 設定、
  仮タップエリア(フェーズ4)を置き換え
- `CoinEmitter.ts`: タップ・購入時の小判パーティクル

**完了条件(手動確認)**: 店員購入でねこが増える。キャンバスタップで小判獲得+演出。
アンマウント/再マウント(StrictMode)でエラー・リークなし

## フェーズ 6: モバイル対応仕上げ・QA

**作業**
- 実機 or DevTools モバイルエミュレーションで: セーフエリア、画面回転・アドレスバー伸縮、
  ダブルタップズーム抑止、rAF 停止→復帰
- エッジケース通し: 時計巻き戻し、セーブ破損(手で localStorage を壊す)、旧版セーブ、
  マルチタブ、8時間超放置(savedAt を手で過去にして確認)
- パフォーマンス: 全店員100体状態で tick とレンダリングのフレーム落ちがないか
- バランス通しプレイ: 加速デバッグフラグ(dev 限定・時間倍率)で初回転生までの体感確認
- README(起動方法・仕様ドキュメントへのリンク)

**完了条件**: 上記チェックリストが全て通る。`npm run build` 成果物で動作確認

---

## 依存関係と並行可能性

```
0 → 1 → 2 → 3 → 4 → 5 → 6
         ↘ format.ts(§4)は 2 の後ならいつでも着手可
```

- 1〜2 は完全に純ロジックなので、UI デザイン(4 のモック)と並行可能
- 5 は 3 完了後なら 4 と並行可能(ストア購読だけに依存し、React UI に依存しないため)

## フェーズ横断の運用ルール

- 仕様の解釈に迷ったら実装で勝手に決めず、GDD/TECH_DESIGN を修正してからコードに反映
  (ドキュメントが常に正)
- 各フェーズ完了時に `npm test` と `npm run build` を通してからコミット
- game-core に React/Pixi/DOM への import が入ったらレビューで弾く(レイヤー違反)

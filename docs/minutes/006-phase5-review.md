# 議事録 006: フェーズ5(PixiJS描画)の Codex 壁打ちとレビュー対応

- 日付: 2026-07-24
- 議題: Pixi v8 ライフサイクルの設計修正、レビューゲートの一部代替実施

## 背景

計画に従い、難所(Pixi v8 async init × React StrictMode)の実装**前**に Codex MCP で壁打ちを実施。
実装後のレビューゲートは2本起動したが、品質レビュー側がセッション使用量上限
(18:20 UTC 回復)の API エラーで実行不能となり、代替措置を取った。

## 相談相手と意見の要旨

- **Codex MCP(実装前壁打ち)**: TECH §10 の擬似コードに誤りを指摘 —
  (1) `app.init()` は `Promise<void>` で Application を返さない(`initPromise.then(app => …)` は誤り)、
  (2) `resizeTo: HTMLElement` は window.resize しか監視せず ResizeObserver ではない、
  (3) init 失敗時は renderer 未生成のため `app.destroy()` が落ちる。
  ほか destroy オプションの推奨(`texture/textureSource` は共有破壊のため指定しない)、
  ref を再入ロックに使うと StrictMode で空画面になる、Text はこの規模なら十分、
  タップは isPrimary で実用十分(ストアの15回/秒が最終防衛線)など
- **仕様準拠レビュー(サブエージェント)**: 指摘2件 — 購入時の小判パーティクルが未配線
  (計画成果物の一部)、不感帯20pxのドキュメント未同期。ほか実ブラウザでのみ確認可能な
  7項目を保留リスト対象として列挙
- **品質レビュー(サブエージェント)**: セッション上限で失敗

## 決定事項と理由

1. **TECH §10 を Codex の指摘どおり全面改訂**してから実装した(ドキュメントが正の原則)。
   ライフサイクルは「クロージャ保持・cancelled フラグ・init完了待ちdestroy・
   renderer存在チェック・ResizeObserver併用」で確定
2. **品質レビューの欠落は「Codex 実装前検証+セルフレビュー」で代替**し、フェーズを閉じる。
   理由: レビュー対象の最難所(ライフサイクル)は Codex が実装前に検証済みで、
   実装はその手順に忠実。再試行は同じ上限に当たるため待機の価値が薄い。
   残る懸念(実機挙動)はもともと実ブラウザ保留リストの管轄
3. 仕様レビューの2件は採用: setOwned に前回値比較を持たせ購入時に該当クラスタで
   小判を鳴らす(初回反映では鳴らさない)、TECH §10 に不感帯の注記。
   バッジ位置もねこと重ならない座標へ調整
4. 実ブラウザ保留リストにフェーズ5の具体項目3行を追加

## 影響

- TECH_DESIGN §10(ライフサイクル全面改訂+不感帯注記)、GDD §5(「演出のみ」の定義)、
  IMPLEMENTATION_PLAN(保留チェックリスト追記)
- src/render/PixiStage.tsx、scene/TeaHouseScene.ts、scene/CoinEmitter.ts(新規)、
  ui/TapArea.tsx(削除・Pixi へ置換)、GameRoot.tsx、GameRoot.module.css
- テスト 134 件全グリーン(描画層は実ブラウザ保留リストで検証予定)

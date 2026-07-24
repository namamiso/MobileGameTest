# ねこ茶屋 〜まったり放置経営〜

江戸風の茶屋をねこたちが切り盛りする放置経営ゲーム(テストプロジェクト)。
タップで小判を稼ぎ、ねこ店員を雇って自動生産し、「のれん分け」(転生)で猫玉を集めて周回する。

- スタック: Next.js 15(App Router)+ PixiJS v8 + zustand + break_infinity.js + TypeScript
- 対象: モバイルブラウザ縦持ち(デスクトップでも動作)
- すべてクライアント完結(localStorage 保存。サーバー・広告・課金なし)

## 開発

```bash
npm install
npm run dev        # 開発サーバー (http://localhost:3000)
npm test           # 単体テスト (vitest / 136件)
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run build      # 本番ビルド
```

### 開発用フラグ

- `http://localhost:3000/?timescale=100` — シミュレーション時間を最大1000倍まで加速
  (dev ビルド限定。バランス確認用。オフライン精算・保存は実時間のまま)

## アーキテクチャ

シミュレーション・状態・描画・UI を一方向依存で分離している(詳細: `docs/TECH_DESIGN.md`)。

```
ui/(React) ─┐
render/(Pixi)─┼→ store/(zustand + 永続化 + タブロック)→ game-core/(純TS: 数式・進行・セーブ)
loop/(rAF) ──┘
```

- `game-core/` は React / Pixi / DOM に依存しない純ロジック。テストはこの層が中心
- オフライン収益は「最終保存時刻から最大8時間・効率50%」。時計改ざん(往復)対策として
  保存時刻は単調非減少
- 複数タブは localStorage のハートビートロックで単一アクティブタブに制御

## ドキュメント

- [ゲームデザイン (GDD)](docs/GDD.md) — 仕様の正
- [技術設計](docs/TECH_DESIGN.md) — 実装方針の正
- [実装計画](docs/IMPLEMENTATION_PLAN.md) — フェーズ構成と保留チェックリスト
- [議事録](docs/minutes/) — 設計判断の経緯(001〜)

## 既知の未検証項目

実装を行った環境にはブラウザがなかったため、実ブラウザでの動作確認は
`docs/IMPLEMENTATION_PLAN.md` の「保留中の実ブラウザ確認チェックリスト」に集約している。
**通常のマシンでは `npm run dev` を開くだけでプレイ・確認できる。**
`sudo npx playwright install-deps chromium` が必要なのは、ブラウザのない環境で
Playwright による自動QAを行う場合のみ。

import {
  Container,
  type FederatedPointerEvent,
  Graphics,
  Rectangle,
  Text,
  type Ticker,
} from 'pixi.js';
import { CoinEmitter } from './CoinEmitter';

export interface TeaHouseSceneOptions {
  /** タップ試行。収入が付与されたら true(レート制限は store 側) */
  onTap: () => boolean;
  /** 付与時のフロート表示文字列(フォーマット済み) */
  getTapGainText: () => string;
}

/** 種別ごとの表示上限。超過分は ×N バッジ(GDD §9) */
export const MAX_VISIBLE_PER_TYPE = 5;

const CAT_COLORS = [
  0xf2c078, 0xd98e5a, 0x9c9c9c, 0x4a4038, 0xf5f0e6, 0xb5651d, 0x7b8a99, 0xc9a86a,
];
const FLOAT_LIFE_SEC = 0.8;
const CLUSTER_CAT_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [-20, 10], [20, 10], [-10, 20], [10, 20],
];

interface TypeCluster {
  group: Container;
  cats: Container[];
  badge: Text;
  baseY: number;
}

interface FloatText {
  node: Text;
  age: number;
}

/** ねこのプレースホルダー(色違い。テスト版アセット。GDD §9) */
function makeCat(color: number, size: number): Container {
  const c = new Container();
  const g = new Graphics();
  const r = size / 2;
  g.poly([-r * 0.75, -r * 0.45, -r * 0.4, -r * 1.2, -r * 0.05, -r * 0.6]).fill(color);
  g.poly([r * 0.75, -r * 0.45, r * 0.4, -r * 1.2, r * 0.05, -r * 0.6]).fill(color);
  g.circle(0, 0, r).fill(color);
  g.circle(-r * 0.32, -r * 0.12, r * 0.09).fill(0x3d2f23);
  g.circle(r * 0.32, -r * 0.12, r * 0.09).fill(0x3d2f23);
  g.circle(0, r * 0.18, r * 0.06).fill(0x3d2f23);
  c.addChild(g);
  return c;
}

/**
 * 茶屋シーン(React 非依存の純 Pixi クラス。TECH_DESIGN §2)。
 * 状態は一切持たず、setOwned() で渡された表示情報を反映するだけ。
 */
export class TeaHouseScene {
  readonly root = new Container();

  private readonly bg = new Graphics();
  private readonly catLayer = new Container();
  private readonly mascot: Container;
  private readonly coins = new CoinEmitter();
  private readonly floatLayer = new Container();
  private readonly tapLayer = new Container();
  private readonly clusters: TypeCluster[] = [];
  private readonly opts: TeaHouseSceneOptions;
  private readonly ticker: Ticker;

  private floats: FloatText[] = [];
  private prevOwned: number[] | null = null;
  private width = 1;
  private height = 1;
  private elapsedSec = 0;
  private mascotPulse = 0;

  constructor(ticker: Ticker, typeCount: number, opts: TeaHouseSceneOptions) {
    this.ticker = ticker;
    this.opts = opts;

    this.mascot = makeCat(0xf2c078, 72);
    for (let i = 0; i < typeCount; i++) {
      const group = new Container();
      const cats: Container[] = [];
      for (const [ox, oy] of CLUSTER_CAT_OFFSETS) {
        const cat = makeCat(CAT_COLORS[i % CAT_COLORS.length], 26);
        cat.position.set(ox, oy);
        cat.visible = false;
        cats.push(cat);
        group.addChild(cat);
      }
      const badge = new Text({
        text: '',
        style: { fontSize: 13, fontWeight: 'bold', fill: 0x5c4033 },
      });
      badge.anchor.set(0.5);
      // ねこ(最右 x≈33)と重ならないグループ右上(GDD §9)
      badge.position.set(38, -22);
      badge.visible = false;
      group.addChild(badge);
      this.clusters.push({ group, cats, badge, baseY: 0 });
      this.catLayer.addChild(group);
    }

    // 全面タップ判定(TECH_DESIGN §7)。同時1点のみ = isPrimary
    this.tapLayer.eventMode = 'static';
    this.tapLayer.on('pointerdown', this.onPointerDown);

    this.root.addChild(
      this.bg,
      this.catLayer,
      this.mascot,
      this.coins.container,
      this.floatLayer,
      this.tapLayer,
    );
    this.ticker.add(this.update);
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.width = width;
    this.height = height;

    this.bg
      .clear()
      .rect(0, 0, width, height * 0.5)
      .fill(0xe8d8b8)
      .rect(0, height * 0.5, width, height * 0.5)
      .fill(0xc8b078)
      .rect(0, height * 0.5 - 4, width, 4)
      .fill(0x5c4033);

    this.mascot.position.set(width / 2, height * 0.36);

    const cols = 4;
    for (let i = 0; i < this.clusters.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cluster = this.clusters[i];
      cluster.baseY = height * (0.64 + row * 0.17);
      cluster.group.position.set(width * ((col + 0.5) / cols), cluster.baseY);
    }

    // 下端 20px は不感帯 — タブバー誤爆防止(議事録005)
    this.tapLayer.hitArea = new Rectangle(0, 0, width, Math.max(0, height - 20));
  }

  /** 店員の所持数を反映(マスタ順)。owned 購読の差分反映から呼ばれる */
  setOwned(counts: readonly number[]): void {
    for (let i = 0; i < this.clusters.length; i++) {
      const count = counts[i] ?? 0;
      const cluster = this.clusters[i];
      const visible = Math.min(count, MAX_VISIBLE_PER_TYPE);
      cluster.cats.forEach((cat, j) => {
        cat.visible = j < visible;
      });
      const showBadge = count > MAX_VISIBLE_PER_TYPE;
      if (showBadge) {
        const label = `×${count}`;
        if (cluster.badge.text !== label) cluster.badge.text = label; // 同一文字列は再生成しない
      }
      cluster.badge.visible = showBadge;

      // 購入時の小判演出(初回反映=ロード直後は鳴らさない)
      if (this.prevOwned !== null && count > (this.prevOwned[i] ?? 0)) {
        this.coins.spawn(cluster.group.x, cluster.baseY - 8, 5);
      }
    }
    this.prevOwned = [...counts];
  }

  private onPointerDown = (event: FederatedPointerEvent): void => {
    if (!event.isPrimary) return;
    const granted = this.opts.onTap();
    const p = event.getLocalPosition(this.root);
    this.mascotPulse = 1;
    // 超過タップは演出のみ(小判フロートなし。GDD §5)
    this.coins.spawn(p.x, p.y, granted ? 6 : 2);
    if (granted) this.spawnFloat(p.x, p.y, `+${this.opts.getTapGainText()}`);
  };

  private spawnFloat(x: number, y: number, text: string): void {
    const node = new Text({
      text,
      style: { fontSize: 18, fontWeight: 'bold', fill: 0xb8860b },
    });
    node.anchor.set(0.5);
    node.position.set(x, y - 12);
    this.floatLayer.addChild(node);
    this.floats.push({ node, age: 0 });
  }

  private update = (ticker: Ticker): void => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.1); // 大きな dt はクランプ
    this.elapsedSec += dt;

    // ねこの群れがゆっくり上下に揺れる
    for (let i = 0; i < this.clusters.length; i++) {
      const cluster = this.clusters[i];
      cluster.group.y = cluster.baseY + Math.sin(this.elapsedSec * 1.6 + i) * 2;
    }

    // マスコットの押下パルス(ぺしゃっと潰れて戻る)
    if (this.mascotPulse > 0) {
      this.mascotPulse = Math.max(0, this.mascotPulse - dt * 6);
    }
    const squish = 0.12 * this.mascotPulse;
    this.mascot.scale.set(1 + squish * 0.5, 1 - squish);

    // 小判フロート
    for (const f of this.floats) {
      f.age += dt;
      f.node.y -= 70 * dt;
      f.node.alpha = Math.max(0, 1 - f.age / FLOAT_LIFE_SEC);
    }
    const expired = this.floats.filter((f) => f.age >= FLOAT_LIFE_SEC);
    if (expired.length > 0) {
      for (const f of expired) f.node.destroy();
      this.floats = this.floats.filter((f) => f.age < FLOAT_LIFE_SEC);
    }

    this.coins.update(dt);
  };

  destroy(): void {
    this.ticker.remove(this.update);
    this.tapLayer.off('pointerdown', this.onPointerDown);
    this.floats = [];
    this.coins.destroy();
    this.root.destroy({ children: true });
  }
}

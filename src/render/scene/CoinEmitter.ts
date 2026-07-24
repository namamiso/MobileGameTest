import { Container, Graphics } from 'pixi.js';

interface Coin {
  node: Graphics;
  vx: number;
  vy: number;
  age: number;
}

const GRAVITY = 900;
const LIFE_SEC = 0.9;
const MAX_COINS = 60;

/** タップ・購入時の小判が跳ねるパーティクル(GDD §5) */
export class CoinEmitter {
  readonly container = new Container();
  private coins: Coin[] = [];

  spawn(x: number, y: number, count: number): void {
    for (let i = 0; i < count && this.coins.length < MAX_COINS; i++) {
      const node = new Graphics();
      node.ellipse(0, 0, 6, 4.5).fill(0xf0c04a).stroke({ width: 1, color: 0xb8860b });
      node.position.set(x, y);
      this.container.addChild(node);
      this.coins.push({
        node,
        vx: (Math.random() - 0.5) * 220,
        vy: -(140 + Math.random() * 160),
        age: 0,
      });
    }
  }

  update(dtSec: number): void {
    for (const coin of this.coins) {
      coin.age += dtSec;
      coin.vy += GRAVITY * dtSec;
      coin.node.x += coin.vx * dtSec;
      coin.node.y += coin.vy * dtSec;
      coin.node.alpha = Math.max(0, 1 - coin.age / LIFE_SEC);
    }
    const expired = this.coins.filter((c) => c.age >= LIFE_SEC);
    if (expired.length > 0) {
      for (const c of expired) c.node.destroy();
      this.coins = this.coins.filter((c) => c.age < LIFE_SEC);
    }
  }

  destroy(): void {
    this.coins = [];
    this.container.destroy({ children: true });
  }
}

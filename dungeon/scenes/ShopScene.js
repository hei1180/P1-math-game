// STUB (Task 4): 裝備室 Shop — replaced by its own task. Shows 「製作中」 and a way back to the map.
import { UI } from '../ui.js?v=0';
import { fx } from '../fx.js?v=0';

export class ShopScene extends Phaser.Scene {
  constructor() { super('Shop'); }
  create(data = {}) {
    fx.irisIn(this);
    const back = data.then || 'Map';
    const ui = new UI(this);
    ui.prompt('裝備室：製作中', 'Shop: coming soon' + (data.key ? ` (${data.key})` : ''), { speak: false });
    const leave = () => fx.iris(this, back, {});
    ui.back(leave);
    ui.button({ id: 'back', zh: '返回地圖', en: 'Back to map', x: this.scale.width / 2, y: this.scale.height / 2 }).then(id => { if (id) leave(); });
  }
}

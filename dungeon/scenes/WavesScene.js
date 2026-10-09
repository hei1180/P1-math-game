// STUB (Task 4): 怪物來了 Monster waves — replaced by its own task. Shows 「製作中」 and a way back to the map.
import { UI } from '../ui.js?v=0';
import { fx } from '../fx.js?v=0';

export class WavesScene extends Phaser.Scene {
  constructor() { super('Waves'); }
  create(data = {}) {
    fx.irisIn(this);
    const back = data.then || 'Map';
    const ui = new UI(this);
    ui.prompt('怪物來了：製作中', 'Monster waves: coming soon' + (data.key ? ` (${data.key})` : ''), { speak: false });
    const leave = () => fx.iris(this, back, {});
    ui.back(leave);
    ui.button({ id: 'back', zh: '返回地圖', en: 'Back to map', x: this.scale.width / 2, y: this.scale.height / 2 }).then(id => { if (id) leave(); });
  }
}

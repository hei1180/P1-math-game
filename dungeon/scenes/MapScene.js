// STUB (Task 4): the map, as a plain list of room buttons so rooms can be reached before Task 9's map lands.
// data: { justDone?, goTo? } — goTo opens that room at once (the end panel's Next).
import { ROOMS, isRoomOpen, isRushOpen } from '../../dungeon-logic.js?v=0';
import { UI, pill } from '../ui.js?v=0';
import { fx } from '../fx.js?v=0';
import { textStyle } from '../theme.js?v=0';

/** Scene key for a room: wave rooms (F1R6, F3R6) run in Waves, the rest in Room. */
export const sceneOfRoom = key => (ROOMS.find(r => r.key === key) || {}).wave ? 'Waves' : 'Room';

export class MapScene extends Phaser.Scene {
  constructor() { super('Map'); }
  create(data = {}) {
    const bridge = this.registry.get('bridge');
    if (data.goTo) { this.scene.start(sceneOfRoom(data.goTo), { key: data.goTo }); return; }
    fx.irisIn(this);
    this.ui = new UI(this);
    this.ui.prompt('地圖（製作中）', 'Map (stub): pick a room', { speak: false });
    this.ui.coins(bridge.coins, false);
    this.list = this.add.container(0, 0);
    this.draw(bridge);
    const onResize = () => this.draw(bridge);
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));
  }

  draw(bridge) {
    this.list.removeAll(true);
    const W = this.scale.width, H = this.scale.height, p = bridge.progress, unlock = bridge.unlock;
    const floors = [1, 2, 3, 4].map(f => ROOMS.filter(r => r.floor === f));
    const top = this.ui.topH + 8, rowsN = 5;
    const rowH = Math.max(52, Math.min(80, (H - top - 12) / rowsN));
    const colW = Math.min(150, (W - 16) / 6.4), bw = colW - 8, bh = rowH - 10;
    const x0 = W / 2 - (6 * colW) / 2 + colW / 2 + colW * 0.2;
    const open = (key, sceneKey, data) => fx.iris(this, sceneKey, data);
    floors.forEach((rooms, fi) => {
      const y = top + rowH * (fi + 0.5);
      this.list.add(this.add.text(x0 - colW * 0.7, y, `F${fi + 1}`, textStyle(20, '#fde68a')).setOrigin(0.5));
      rooms.forEach((r, i) => {
        const st = (p.stars || {})[r.key] || 0, ok = isRoomOpen(p, r.key, unlock, bridge.testMode);
        const b = pill(this, {
          zh: r.zh, en: `${r.key} ${'★'.repeat(st)}${ok ? '' : ' 🔒'}`, w: bw, h: bh, size: 17,
          fill: r.wave ? 0xfee2e2 : 0xffffff, rim: st ? 0x22c55e : 0xb45309,
        }, () => { if (ok) open(r.key, sceneOfRoom(r.key), { key: r.key }); else this.ui.toast('未開放', 'Locked', 900); });
        b.setPosition(x0 + i * colW, y);
        this.list.add(b);
      });
    });
    const y = top + rowH * 4.5;
    const extras = [
      { zh: '寶藏快手', en: 'Rush', go: () => (isRushOpen(p, unlock, bridge.testMode) ? open('Rush', 'Rush', {}) : this.ui.toast('未開放', 'Locked', 900)) },
      { zh: '裝備室', en: 'Shop', go: () => open('Shop', 'Shop', {}) },
      { zh: '英雄', en: 'Make hero', go: () => open('MakeHero', 'MakeHero', { then: 'Map' }) },
      { zh: '🏆 排行榜', en: 'Leaderboard', go: () => bridge.showLeaderboard() },
    ];
    const ew = Math.min(170, (W - 24) / 4);
    extras.forEach((e, i) => {
      const b = pill(this, { zh: e.zh, en: e.en, w: ew - 10, h: bh, size: 18, fill: 0xfde047, rim: 0xb45309 }, e.go);
      b.setPosition(W / 2 + (i - 1.5) * ew, y);
      this.list.add(b);
    });
  }
}

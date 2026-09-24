import { textStyle } from '../theme.js?v=0';
export class MapScene extends Phaser.Scene {
  constructor() { super('Map'); }
  init(data) { this.startData = data || {}; }
  create() {
    this.add.text(20, 20, 'Map (stub)', textStyle(24));
    if (Object.keys(this.startData).length) this.add.text(20, 60, JSON.stringify(this.startData), textStyle(14));
  }
}

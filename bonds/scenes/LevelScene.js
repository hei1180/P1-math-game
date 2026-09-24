import { textStyle } from '../theme.js?v=0';
export class LevelScene extends Phaser.Scene {
  constructor() { super('Level'); }
  init(data) { this.startData = data || {}; }
  create() {
    this.add.text(20, 20, 'Level (stub)', textStyle(24));
    if (Object.keys(this.startData).length) this.add.text(20, 60, JSON.stringify(this.startData), textStyle(14));
  }
}

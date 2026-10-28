// Boot: loads the Kenney sheets, builds code-drawn art + fx textures, then opens ?scene= (dev), MakeHero (no hero yet) or the Map.
import { preloadArt, buildArt } from '../art.js?v=202610112341';
import { fx } from '../fx.js?v=202610112341';
import { textStyle } from '../theme.js?v=202610112341';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    const t = this.add.text(this.scale.width / 2, this.scale.height / 2, '載入中… Loading…', textStyle(22, '#fde68a')).setOrigin(0.5);
    this.load.on('complete', () => t.destroy());
    preloadArt(this);
  }
  create() {
    fx.makeTextures(this);
    buildArt(this);
    const bridge = this.registry.get('bridge');
    if (bridge.devStart) this.scene.start(bridge.devStart.key, bridge.devStart.data);
    else if (!bridge.progress.hero) this.scene.start('MakeHero', { then: 'Map' });
    else this.scene.start('Map');
  }
}

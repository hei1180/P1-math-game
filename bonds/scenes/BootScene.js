export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  create() {
    const g = this.make.graphics({ add: false });
    g.fillStyle(0xffffff); g.fillCircle(8, 8, 8); g.generateTexture('dot', 16, 16); g.clear();
    g.fillStyle(0xffffff); g.fillCircle(16, 16, 16); g.generateTexture('puff', 32, 32); g.clear();
    g.fillStyle(0xffffff); g.fillRect(0, 0, 10, 6); g.generateTexture('confetti', 10, 6); g.clear();
    g.fillStyle(0xffffff); g.fillRect(0, 0, 3, 12); g.generateTexture('spark', 3, 12); g.clear();
    const pts = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 7 : 16; const a = -Math.PI / 2 + i * Math.PI / 5; pts.push(new Phaser.Geom.Point(16 + r * Math.cos(a), 16 + r * Math.sin(a))); }
    g.fillStyle(0xffffff); g.fillPoints(pts, true); g.generateTexture('star', 32, 32); g.destroy();
    this.scene.start(new URLSearchParams(location.search).has('sandbox') ? 'Sandbox' : 'Map');
  }
}

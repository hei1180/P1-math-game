import { Scene } from '../engine/scenes.js?v=0';

// TEMPORARY navigation stub (replaced by the real Workshop map in T8): lists every scene key.
const KEYS = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'Boss', 'Rush', 'Garage', 'FreeBuild', 'Gallery', 'Sandbox'];
const dataFor = key => (/^[AB]\d$/.test(key) ? { key } : key === 'Rush' ? { zone: 'a' } : key === 'FreeBuild' ? { mode: 'peg' } : undefined);

export class WorkshopScene extends Scene {
  async enter() {
    const { ui, go } = this.ctx;
    ui.prompt('工場', 'Workshop (temporary menu)', { speak: false });
    const id = await ui.choices(KEYS.map(k => ({ id: k, zh: k })), { columns: 4 });
    go(id, dataFor(id));
  }
}

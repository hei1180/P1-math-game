import { Scene } from '../engine/scenes.js?v=202610051406';

const wait = ms => new Promise(r => setTimeout(r, ms));

// Shows a little robot while fonts load (max 1 s), then opens the Workshop (or the dev ?scene= target).
export class BootScene extends Scene {
  async enter() {
    const { bridge, go } = this.ctx;
    const box = document.createElement('div');
    box.className = 'absolute inset-0 flex flex-col items-center justify-center bg-sky-100';
    const bot = document.createElement('div');
    bot.className = 'ui-pulse text-7xl';
    bot.textContent = '🤖';
    const text = document.createElement('div');
    text.className = 'mt-3 text-2xl font-bold text-gray-700';
    text.textContent = '載入中… Loading';
    box.append(bot, text);
    document.getElementById('ui').appendChild(box); // removed by ui.clear() on the next scene switch
    try { await Promise.race([document.fonts.ready, wait(1000)]); } catch (e) { /* ignore */ }
    const t = bridge.devStart;
    go(t ? t.key : 'Workshop', t ? t.data : undefined);
  }
}

// Crisp canvas on retina screens for Rod Town 數棒鎮.
//
// Scale.RESIZE draws one canvas pixel per CSS pixel, which looks soft on 2-3x phone / iPad screens.
// Instead the canvas is sized in device pixels (Scale.NONE, zoom 1/DPR keeps its CSS size) and:
//   - every scene camera zooms by DPR with origin (0, 0), so world coordinates stay in CSS px;
//   - every scene's `this.scale` reports the logical (CSS px) width / height, so the scenes' layout
//     code is unchanged (Phaser internals keep using `sys.scale`, the real device-pixel manager);
//   - the canvas follows its parent (#phaser) via ResizeObserver, and at once whenever code calls
//     scale.getParentBounds() (the Rush HUD toggle does, then expects the new size immediately).
//   - `scene.add.text` defaults to resolution DPR so emoji / labels stay sharp too.
// Pointer screen coordinates (pointer.x / y) are in device px; use pointer.worldX / worldY, or divide by
// the camera zoom. Do not use cam.setBounds (Phaser's clamp assumes a centred origin). DPR is capped
// at 2: sharper still costs fill rate on older iPads.
export const DPR = Math.min(2, Math.max(1, window.devicePixelRatio || 1));

function cssSize(el) {
  const r = el.getBoundingClientRect();
  return { w: Math.max(1, Math.floor(r.width)), h: Math.max(1, Math.floor(r.height)) };
}

/** Phaser `scale` config for the parent element id. */
export function scaleConfig(parentId) {
  const { w, h } = cssSize(document.getElementById(parentId));
  return { mode: Phaser.Scale.NONE, parent: parentId, width: w * DPR, height: h * DPR, zoom: 1 / DPR };
}

/** Call once, right after `new Phaser.Game(...)`. */
export function installHiDPI(game, parentId) {
  const S = game.scale, el = document.getElementById(parentId);
  let busy = false;
  const fit = () => {
    if (busy || !S.canvas) return;
    const { w, h } = cssSize(el);
    if (Math.abs(S.width - w * DPR) < 1 && Math.abs(S.height - h * DPR) < 1) return;
    busy = true;
    try { S.resize(w * DPR, h * DPR); } finally { busy = false; }
  };
  const getParentBounds = S.getParentBounds;
  S.getParentBounds = function () { const r = getParentBounds.apply(this, arguments); fit(); return r; };
  if (window.ResizeObserver) new ResizeObserver(fit).observe(el);
  window.addEventListener('resize', fit);

  const logical = new Proxy(S, {
    get(t, p) {
      if (p === 'width') return t.width / DPR;
      if (p === 'height') return t.height / DPR;
      const v = Reflect.get(t, p, t);
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
  const setup = scene => {
    if (scene.__hidpi) return;
    scene.__hidpi = true;
    scene.scale = logical;
    // CameraManager makes a fresh main camera on every (re)start, before this listener runs
    scene.sys.events.on('start', () => scene.cameras.main.setOrigin(0, 0).setZoom(DPR));
  };
  game.scene.scenes.forEach(setup);
  game.events.once('ready', () => game.scene.scenes.forEach(setup));

  // text drawn at device resolution unless a style asks otherwise (emoji decorations, icons, …)
  const F = Phaser.GameObjects.GameObjectFactory.prototype, text = F.text;
  if (!text.__hidpi) {
    F.text = function (x, y, str, style) { return text.call(this, x, y, str, { resolution: DPR, ...(style || {}) }); };
    F.text.__hidpi = true;
  }
}

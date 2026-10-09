// Human-readable names for game/mode keys. Pure; shared by shared.js, teacher.html and tests.

export const GAME_LABEL = { market: '🍎 Math Market', numbers: '🔢 Number Shop', bonds: '🚂 Rod Town', shapes: '🤖 Robot Workshop', picnic: '🧺 Picnic Park' };

const MARKET = { easy: 'Market · Easy 1-10', medium: 'Market · Medium 1-20', hard: 'Market · Hard' };
const NUMBERS = { num1: 'Number Shop Lv1 比較', num2: 'Number Shop Lv2 奇偶', num3: 'Number Shop Lv3 數線', num4: 'Number Shop Lv4 奇偶數線' };
const SHAPES = {
  shapesA1: 'A1 滾動測試', shapesA2: 'A2 疊高塔', shapesA3: 'A3 神秘袋', shapesA4: 'A4 身邊的立體',
  shapesB1: 'B1 直線和曲線', shapesB2: 'B2 圖形大胃王', shapesB3: 'B3 釘板圍圖形', shapesB4: 'B4 拼砌圖形',
  shapesBoss: '測試跑道', shapes3d: 'Rush 立體', shapes2d: 'Rush 平面',
};

const PICNIC_CH = { Add: '加法', Sub: '減法', Zero: '0 的認識' };
const PICNIC_LV = {
  Add: ['認識加法', '用橫式記錄', '加法口算', '有趣的加法', '小老師'],
  Sub: ['認識減法', '比一比', '減法口算', '加和減的關係', '小老師'],
  Zero: ['認識 0', '0 的加法', '0 的減法', '0 的規律', '單元挑戰'],
};

/** 'easy' → 'market', 'num3' → 'numbers', 'bonds2' | 'w1-4' | 'w2-boss' → 'bonds'. */
export function gameOf(mode) {
  if (MARKET[mode]) return 'market';
  if (NUMBERS[mode]) return 'numbers';
  if (SHAPES[mode]) return 'shapes';
  if (/^picnic(Add|Sub|Zero)[1-5]$/.test(mode)) return 'picnic';
  if (/^bonds[1-4]$/.test(mode) || /^w[1-4]-(\d|boss)$/.test(mode)) return 'bonds';
  return 'unknown';
}

export function modeLabel(mode) {
  if (MARKET[mode]) return MARKET[mode];
  if (NUMBERS[mode]) return NUMBERS[mode];
  if (SHAPES[mode]) return 'Robot Workshop ' + SHAPES[mode];
  let m = /^picnic(Add|Sub|Zero)([1-5])$/.exec(mode);
  if (m) return `Picnic Park ${PICNIC_CH[m[1]]} 第${m[2]}關 ${PICNIC_LV[m[1]][m[2] - 1]}`;
  m = /^bonds([1-4])$/.exec(mode);
  if (m) return `Rod Town Rush W${m[1]}`;
  m = /^w([1-4])-(\d)$/.exec(mode);
  if (m) return `Rod Town W${m[1]} 第${m[2]}關`;
  m = /^w([1-4])-boss$/.exec(mode);
  if (m) return `Rod Town W${m[1]} 數字屋`;
  return mode;
}

// Human-readable names for game/mode keys. Pure; shared by shared.js, teacher.html and tests.

export const GAME_LABEL = { market: '🍎 Math Market', numbers: '🔢 Number Shop', bonds: '🚂 Rod Town' };

const MARKET = { easy: 'Market · Easy 1-10', medium: 'Market · Medium 1-20', hard: 'Market · Hard' };
const NUMBERS = { num1: 'Number Shop Lv1 比較', num2: 'Number Shop Lv2 奇偶', num3: 'Number Shop Lv3 數線', num4: 'Number Shop Lv4 奇偶數線' };

/** 'easy' → 'market', 'num3' → 'numbers', 'bonds2' | 'w1-4' | 'w2-boss' → 'bonds'. */
export function gameOf(mode) {
  if (MARKET[mode]) return 'market';
  if (NUMBERS[mode]) return 'numbers';
  if (/^bonds[1-4]$/.test(mode) || /^w[1-4]-(\d|boss)$/.test(mode)) return 'bonds';
  return 'unknown';
}

export function modeLabel(mode) {
  if (MARKET[mode]) return MARKET[mode];
  if (NUMBERS[mode]) return NUMBERS[mode];
  let m = /^bonds([1-4])$/.exec(mode);
  if (m) return `Rod Town Rush W${m[1]}`;
  m = /^w([1-4])-(\d)$/.exec(mode);
  if (m) return `Rod Town W${m[1]} 第${m[2]}關`;
  m = /^w([1-4])-boss$/.exec(mode);
  if (m) return `Rod Town W${m[1]} 數字屋`;
  return mode;
}

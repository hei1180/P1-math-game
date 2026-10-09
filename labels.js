// Human-readable names for game/mode keys. Pure; shared by shared.js, teacher.html and tests.

export const GAME_LABEL = { market: '🍎 Math Market', numbers: '🔢 Number Shop', bonds: '🚂 Rod Town', shapes: '🤖 Robot Workshop', dungeon: '🗝️ Treasure Dungeon' };

const MARKET = { easy: 'Market · Easy 1-10', medium: 'Market · Medium 1-20', hard: 'Market · Hard' };
const NUMBERS = { num1: 'Number Shop Lv1 比較', num2: 'Number Shop Lv2 奇偶', num3: 'Number Shop Lv3 數線', num4: 'Number Shop Lv4 奇偶數線' };
const SHAPES = {
  shapesA1: 'A1 滾動測試', shapesA2: 'A2 疊高塔', shapesA3: 'A3 神秘袋', shapesA4: 'A4 身邊的立體',
  shapesB1: 'B1 直線和曲線', shapesB2: 'B2 圖形大胃王', shapesB3: 'B3 釘板圍圖形', shapesB4: 'B4 拼砌圖形',
  shapesBoss: '測試跑道', shapes3d: 'Rush 立體', shapes2d: 'Rush 平面',
};
const DUNGEON = {
  dungeonF1R1: 'F1R1 火把走廊', dungeonF1R2: 'F1R2 寶箱排排', dungeonF1R3: 'F1R3 兵器架', dungeonF1R4: 'F1R4 貓頭鷹問你', dungeonF1R5: 'F1R5 我的寶庫', dungeonF1R6: 'F1R6 怪物來了！',
  dungeonF2R1: 'F2R1 史萊姆列隊', dungeonF2R2: 'F2R2 排隊入門', dungeonF2R3: 'F2R3 轉身！', dungeonF2R4: 'F2R4 貓頭鷹問你', dungeonF2R5: 'F2R5 我的巡遊',
  dungeonF3R1: 'F3R1 倒掛蝠蝠', dungeonF3R2: 'F3R2 爬梯子', dungeonF3R3: 'F3R3 藥水架', dungeonF3R4: 'F3R4 貓頭鷹問你', dungeonF3R5: 'F3R5 我的高塔', dungeonF3R6: 'F3R6 蝙蝠和地鼠',
  dungeonF4R1: 'F4R1 熱身', dungeonF4R2: 'F4R2 玩具架解難', dungeonF4R3: 'F4R3 迷路走廊', dungeonF4R4: 'F4R4 巴士站', dungeonF4R5: 'F4R5 龍的寶庫',
  dungeonRush: 'Rush 寶藏快手',
};

/** 'easy' → 'market', 'num3' → 'numbers', 'bonds2' | 'w1-4' | 'w2-boss' → 'bonds'. */
export function gameOf(mode) {
  if (MARKET[mode]) return 'market';
  if (NUMBERS[mode]) return 'numbers';
  if (SHAPES[mode]) return 'shapes';
  if (DUNGEON[mode]) return 'dungeon';
  if (/^bonds[1-4]$/.test(mode) || /^w[1-4]-(\d|boss)$/.test(mode)) return 'bonds';
  return 'unknown';
}

export function modeLabel(mode) {
  if (MARKET[mode]) return MARKET[mode];
  if (NUMBERS[mode]) return NUMBERS[mode];
  if (SHAPES[mode]) return 'Robot Workshop ' + SHAPES[mode];
  if (DUNGEON[mode]) return 'Treasure Dungeon ' + DUNGEON[mode];
  let m = /^bonds([1-4])$/.exec(mode);
  if (m) return `Rod Town Rush W${m[1]}`;
  m = /^w([1-4])-(\d)$/.exec(mode);
  if (m) return `Rod Town W${m[1]} 第${m[2]}關`;
  m = /^w([1-4])-boss$/.exec(mode);
  if (m) return `Rod Town W${m[1]} 數字屋`;
  return mode;
}

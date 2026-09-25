// Shared visual theme for Rod Town 數棒鎮.
export const FONT = '"Chalkboard SE","Comic Sans MS","PingFang TC","Microsoft JhengHei",sans-serif';
export const UI = { ink: 0x1f2937, paper: 0xfffbeb, good: 0x22c55e, bad: 0xef4444, gold: 0xfacc15, white: 0xffffff };
export const WORLD_THEME = {
  1: { sky: 0xbae6fd, ground: 0x86efac, accent: 0x16a34a, emoji: '🌼' },
  2: { sky: 0x7dd3fc, ground: 0xfde68a, accent: 0x0284c7, emoji: '🐚' },
  3: { sky: 0xa7f3d0, ground: 0x4d7c0f, accent: 0x166534, emoji: '🍄' },
  4: { sky: 0xe0f2fe, ground: 0xf8fafc, accent: 0x6366f1, emoji: '❄️' },
};
/** Text style helper: big Chinese / small English. */
export const textStyle = (size, color = '#1f2937', extra = {}) => ({ fontFamily: FONT, fontSize: `${Math.round(size)}px`, color, fontStyle: 'bold', ...extra });

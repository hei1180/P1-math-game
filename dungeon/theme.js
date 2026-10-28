// Shared visual theme for Treasure Dungeon 尋寶地下城.
export const FONT = '"Chalkboard SE","Comic Sans MS","PingFang TC","Microsoft JhengHei",sans-serif';
export const UI = { ink: 0x1f2937, paper: 0xfffbeb, good: 0x22c55e, bad: 0xef4444, gold: 0xfacc15, white: 0xffffff };
/** Room colours (art behind the Kenney tiles, shadows under sprites). */
export const ROOM = { wall: 0x4a3b5c, floor: 0x6b5a4e, shadow: 0x000000 };
/** Text style helper: big Chinese / small English. Smooth text, padded for CJK. */
export const textStyle = (size, color = '#1f2937', extra = {}) => ({ fontFamily: FONT, fontSize: `${Math.round(size)}px`, color, fontStyle: 'bold', padding: { x: 2, y: 4 }, ...extra });

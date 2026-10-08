// Robot Workshop look: fonts, UI colours, scene colours, toy palette.
export const FONT = '"Chalkboard SE","Comic Sans MS","PingFang TC","Microsoft JhengHei",sans-serif';
export const COLORS = { ink: '#1f2937', paper: '#fffbeb', good: '#22c55e', bad: '#ef4444', gold: '#facc15' };
export const SCENE = { sky: 0xbfe3f5, floor: 0xf3e3c8, wall: 0xdbeafe, bench: 0xd9a066, metal: 0x94a3b8, dark: 0x334155 };
export const TOY_COLORS = [0xef4444, 0xf97316, 0xfacc15, 0x22c55e, 0x06b6d4, 0x3b82f6, 0xa855f7, 0xec4899];
// Never pick a colour from the shape type (colour must not tell the shape).
export function toyColor(rng = Math.random) { return TOY_COLORS[Math.floor(rng() * TOY_COLORS.length) % TOY_COLORS.length]; }
// A tile's colour comes from where it sits, never from which shape it is (so a saved creation looks the same everywhere).
export const pieceColor = (x, y, r) => TOY_COLORS[(x * 3 + y * 5 + r * 7) % TOY_COLORS.length];

// Pure trophy logic. No DOM, no Firebase. Imported by shared.js and by tests.

export const DEFAULT_TROPHY = { bronze: 300, silver: 700, gold: 1200 };

export const TROPHY_ICON = { gold: '🥇', silver: '🥈', bronze: '🥉', finisher: '🎖' };
export const TROPHY_LABEL = { gold: '金牌 Gold', silver: '銀牌 Silver', bronze: '銅牌 Bronze', finisher: '完成 Finisher' };

/** @returns {'gold'|'silver'|'bronze'|'finisher'|null} */
export function trophyFor(score, cutoffs = DEFAULT_TROPHY) {
  if (!(score > 0)) return null;
  if (score >= cutoffs.gold) return 'gold';
  if (score >= cutoffs.silver) return 'silver';
  if (score >= cutoffs.bronze) return 'bronze';
  return 'finisher';
}

export function validateCutoffs(c) {
  if (!c) return false;
  const { bronze, silver, gold } = c;
  const nums = [bronze, silver, gold];
  if (!nums.every(n => Number.isFinite(n) && n > 0)) return false;
  return bronze < silver && silver < gold;
}

/** Tick spacing for a time axis of `days` length. Text formatting lives in src/i18n. */
export function tickPlan(days: number): { unit: 'day' | 'month' | 'year'; every: number } {
  if (days <= 14) return { unit: 'day', every: 1 };
  if (days <= 40) return { unit: 'day', every: 2 };
  if (days <= 120) return { unit: 'day', every: 7 };
  if (days <= 450) return { unit: 'month', every: 1 };
  if (days <= 1500) return { unit: 'month', every: 3 };
  return { unit: 'year', every: 1 };
}

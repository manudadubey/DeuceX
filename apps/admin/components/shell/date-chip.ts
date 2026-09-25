// "Sat 12 Sep · Week 37" (Baseline §Chrome topbar). ISO week number, Australian English date.
export function formatDateChip(date: Date): string {
  const weekday = date.toLocaleDateString('en-AU', { weekday: 'short' });
  const day = date.getDate();
  const month = date.toLocaleDateString('en-AU', { month: 'short' });
  return `${weekday} ${day} ${month} · Week ${isoWeekNumber(date)}`;
}

function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

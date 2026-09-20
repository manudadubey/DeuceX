/**
 * `axisK()` from Baseline §Charts: formats a money axis tick as "9.4k" or a whole number,
 * so a currency change redraws every axis. Takes an explicit conversion `rate` (the prototype
 * read a global `PREFS`/`RATES`; here that comes from the caller, e.g. `fx_rates_daily`).
 */
export function axisK(value: number, rate = 1): string {
  const converted = Math.abs(value) * rate;
  const label =
    converted >= 1000
      ? `${(Math.round(converted / 100) / 10).toString().replace(/\.0$/, '')}k`
      : Math.round(converted).toString();
  return (value < 0 ? '−' : '') + label;
}

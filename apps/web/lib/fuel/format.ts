// Money and language display for the Fuel page. Home amounts use the
// en-US currency symbol so AUD reads "A$14" as PRD-07 writes it; display
// rounds to whole units and the exact value stays in the data (section 7).

export function formatHome(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount);
}

export function homeSymbol(currency: string): string {
  return (
    new Intl.NumberFormat('en-US', { style: 'currency', currency })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? currency
  );
}

// Menu currencies whose everyday name reads better than a symbol.
const MENU_UNIT: Record<string, { name: string; suffix: string }> = {
  RON: { name: 'lei', suffix: 'lei' },
  PLN: { name: 'złoty', suffix: 'zł' },
  CZK: { name: 'koruna', suffix: 'Kč' },
  HUF: { name: 'forint', suffix: 'Ft' },
  TRY: { name: 'lira', suffix: '₺' },
};

export function formatMenu(amount: number, currency: string): string {
  const unit = MENU_UNIT[currency];
  const n = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 2 }).format(amount);
  if (unit) return `${n} ${unit.suffix}`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);
}

export function menuCurrencyName(currency: string): string {
  if (MENU_UNIT[currency]) return MENU_UNIT[currency].name;
  if (currency === 'EUR') return 'euro';
  return currency;
}

export function languageList(codes: string[]): string {
  const names = new Intl.DisplayNames(['en'], { type: 'language' });
  const list = codes.map((c) => {
    try {
      return names.of(c) ?? c;
    } catch {
      return c;
    }
  });
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
}

export function shortDate(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function rateTitle(
  rate: number | null,
  rateDate: string | null,
  menuCurrency: string | null,
  homeCurrency: string,
): string | undefined {
  if (rate === null || !rateDate || !menuCurrency) return undefined;
  return `1 ${menuCurrency} = ${rate.toFixed(4)} ${homeCurrency} · ECB reference rate, ${shortDate(rateDate)}`;
}

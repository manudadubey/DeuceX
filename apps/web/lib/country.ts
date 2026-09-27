// Onboarding stores the country's name (onboarding-wizard.tsx's COUNTRIES);
// the prototype shows the three-letter code, and a flag where one is drawn.
const COUNTRY_CODE: Record<string, string> = {
  Austria: 'AUT',
  Australia: 'AUS',
  Germany: 'GER',
  Italy: 'ITA',
  Spain: 'ESP',
  China: 'CHN',
  'United States': 'USA',
};

export function countryCode(country: string): string | null {
  return COUNTRY_CODE[country] ?? (/^[A-Z]{3}$/.test(country) ? country : null);
}

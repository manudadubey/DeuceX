import type { EcbDailyRates, EcbRateAdapter } from './adapter';

const ECB_DAILY_XML_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

export class EcbFeedParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EcbFeedParseError';
  }
}

export class EcbFeedFetchError extends Error {
  constructor(readonly status: number) {
    super(`ECB daily reference rate feed returned HTTP ${status}`);
    this.name = 'EcbFeedFetchError';
  }
}

// The feed's own shape is small, fixed and has been stable for years (one
// <Cube time="..."> wrapping a flat list of <Cube currency="..." rate="..."/>
// elements); a two-pattern regex parse avoids pulling in a general XML
// parser dependency for a single, non-user-controlled, well-known format.
// Exported and pure so ecb-adapter.test.ts can prove it against a realistic
// fixture string with no network call.
export function parseEcbDailyXml(xml: string): EcbDailyRates {
  const dateMatch = xml.match(/<Cube\s+time=["']([0-9]{4}-[0-9]{2}-[0-9]{2})["']/);
  if (!dateMatch)
    throw new EcbFeedParseError('Could not find a dated <Cube time="..."> element in the ECB feed');

  const rates: Record<string, number> = {};
  const rateRe = /<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([0-9.]+)["']\s*\/>/g;
  for (const match of xml.matchAll(rateRe)) {
    const [, currency, rateStr] = match;
    if (!currency || !rateStr) continue;
    rates[currency] = Number(rateStr);
  }
  if (Object.keys(rates).length === 0) {
    throw new EcbFeedParseError('Found a dated <Cube> but no currency rates inside it');
  }

  return { date: dateMatch[1] as string, rates };
}

// The only production implementation: ECB's daily reference rate feed is a
// free, unauthenticated, public XML endpoint (no API key, unlike Whisper or
// R2), so there is no fixture-vs-real fallback branch in apps/api/src/index.ts
// the way transcription/storage need one — this adapter is always wired in.
export function createEcbAdapter(): EcbRateAdapter {
  return {
    async fetchDailyRates(): Promise<EcbDailyRates> {
      const response = await fetch(ECB_DAILY_XML_URL);
      if (!response.ok) throw new EcbFeedFetchError(response.status);
      const xml = await response.text();
      return parseEcbDailyXml(xml);
    },
  };
}

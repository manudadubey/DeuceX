import { describe, expect, it } from 'vitest';
import { EcbFeedParseError, parseEcbDailyXml } from './ecb-adapter';

// A trimmed but structurally faithful fixture of the real
// https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml response.
const FIXTURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<gesmes:subject>Reference rates</gesmes:subject>
	<gesmes:Sender>
		<gesmes:name>European Central Bank</gesmes:name>
	</gesmes:Sender>
	<Cube>
		<Cube time='2026-09-19'>
			<Cube currency='USD' rate='1.0850'/>
			<Cube currency='JPY' rate='163.03'/>
			<Cube currency='AUD' rate='1.6510'/>
			<Cube currency='CNY' rate='7.8420'/>
		</Cube>
	</Cube>
</gesmes:Envelope>`;

describe('parseEcbDailyXml', () => {
  it('extracts the feed date and every currency rate', () => {
    const result = parseEcbDailyXml(FIXTURE_XML);
    expect(result.date).toBe('2026-09-19');
    expect(result.rates).toEqual({ USD: 1.085, JPY: 163.03, AUD: 1.651, CNY: 7.842 });
  });

  it('never includes EUR itself (the feed excludes its own base currency)', () => {
    const result = parseEcbDailyXml(FIXTURE_XML);
    expect(result.rates.EUR).toBeUndefined();
  });

  it('throws EcbFeedParseError when the feed has no dated Cube element', () => {
    expect(() => parseEcbDailyXml('<Envelope></Envelope>')).toThrow(EcbFeedParseError);
  });

  it('throws EcbFeedParseError when the date is found but no rates are', () => {
    expect(() => parseEcbDailyXml('<Cube time="2026-09-19"></Cube>')).toThrow(EcbFeedParseError);
  });
});

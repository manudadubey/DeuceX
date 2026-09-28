import { describe, expect, it } from 'vitest';
import { parseContact } from './someone-to-call-card';

describe('parseContact (MC-16 named contact)', () => {
  it('splits a name and a number typed in Settings', () => {
    expect(parseContact('Gerhard B. +43 664 123 4567')).toEqual({
      name: 'Gerhard B.',
      tel: '+436641234567',
      shown: '+43 664 123 4567',
    });
    expect(parseContact('Mum, 0412 345 678')).toMatchObject({ name: 'Mum', tel: '0412345678' });
  });

  it('keeps a contact with no number as a name only', () => {
    expect(parseContact('My coach Marko')).toEqual({
      name: 'My coach Marko',
      tel: null,
      shown: null,
    });
  });
});

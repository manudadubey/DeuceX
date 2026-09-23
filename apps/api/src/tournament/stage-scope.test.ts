import { describe, expect, it } from 'vitest';
import { isInStageScope } from './stage-scope';

describe('isInStageScope (PRD-01 section 2)', () => {
  it('men: stage 1 scans ITF M15/M25 only', () => {
    expect(isInStageScope('atp', '1', { tour: 'itf_men', tier: 'ITF M15' })).toBe(true);
    expect(isInStageScope('atp', '1', { tour: 'itf_men', tier: 'ITF M25' })).toBe(true);
    expect(isInStageScope('atp', '1', { tour: 'atp', tier: 'CH 75' })).toBe(false);
  });

  it('men: stage 2 scans ITF M25 plus Challenger 50-100', () => {
    expect(isInStageScope('atp', '2', { tour: 'itf_men', tier: 'ITF M25' })).toBe(true);
    expect(isInStageScope('atp', '2', { tour: 'itf_men', tier: 'ITF M15' })).toBe(false);
    expect(isInStageScope('atp', '2', { tour: 'atp', tier: 'CH 75' })).toBe(true);
    expect(isInStageScope('atp', '2', { tour: 'atp', tier: 'CH 100' })).toBe(true);
    expect(isInStageScope('atp', '2', { tour: 'atp', tier: 'CH 125' })).toBe(false);
  });

  it('men: stage 3 scans Challenger 50-125 and ATP 250', () => {
    expect(isInStageScope('atp', '3', { tour: 'atp', tier: 'CH 125' })).toBe(true);
    expect(isInStageScope('atp', '3', { tour: 'atp', tier: 'ATP 250' })).toBe(true);
    expect(isInStageScope('atp', '3', { tour: 'itf_men', tier: 'ITF M25' })).toBe(false);
  });

  it('women: stage 1 scans ITF W15/W35 only', () => {
    expect(isInStageScope('wta', '1', { tour: 'itf_women', tier: 'ITF W15' })).toBe(true);
    expect(isInStageScope('wta', '1', { tour: 'itf_women', tier: 'ITF W35' })).toBe(true);
    expect(isInStageScope('wta', '1', { tour: 'wta', tier: 'WTA 125' })).toBe(false);
  });

  it('women: stage 2 scans ITF W35-W100 and WTA 125', () => {
    expect(isInStageScope('wta', '2', { tour: 'itf_women', tier: 'ITF W35' })).toBe(true);
    expect(isInStageScope('wta', '2', { tour: 'itf_women', tier: 'ITF W100' })).toBe(true);
    expect(isInStageScope('wta', '2', { tour: 'wta', tier: 'WTA 125' })).toBe(true);
    expect(isInStageScope('wta', '2', { tour: 'wta', tier: 'WTA 250' })).toBe(false);
  });

  it('women: stage 3 scans WTA 125, ITF W100 and WTA 250', () => {
    expect(isInStageScope('wta', '3', { tour: 'wta', tier: 'WTA 125' })).toBe(true);
    expect(isInStageScope('wta', '3', { tour: 'itf_women', tier: 'ITF W100' })).toBe(true);
    expect(isInStageScope('wta', '3', { tour: 'wta', tier: 'WTA 250' })).toBe(true);
    expect(isInStageScope('wta', '3', { tour: 'itf_women', tier: 'ITF W35' })).toBe(false);
  });
});

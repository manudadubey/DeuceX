import { describe, expect, it } from 'vitest';
import { adminAreas, canAccessArea, effectiveRole } from './admin-roles';

describe('admin roles (PRD-13 AD-2, AD-AC-1)', () => {
  it('keeps Money and Ingestion away from support', () => {
    expect(canAccessArea('support', 'money')).toBe(false);
    expect(canAccessArea('support', 'ingestion')).toBe(false);
    expect(canAccessArea('support', 'agents')).toBe(false);
    expect(adminAreas('support')).toEqual(['overview', 'players', 'trust', 'audit']);
  });

  it('gives ops agents and ingestion but not money', () => {
    expect(canAccessArea('ops', 'agents')).toBe(true);
    expect(canAccessArea('ops', 'ingestion')).toBe(true);
    expect(canAccessArea('ops', 'money')).toBe(false);
  });

  it('gives the owner everything', () => {
    expect(canAccessArea('owner', 'money')).toBe(true);
  });

  it('lets a role preview narrow but never widen', () => {
    expect(effectiveRole('owner', 'support')).toBe('support');
    expect(effectiveRole('ops', 'support')).toBe('support');
    expect(effectiveRole('support', 'owner')).toBe('support');
    expect(effectiveRole('ops', 'owner')).toBe('ops');
    expect(effectiveRole('owner', 'nonsense')).toBe('owner');
    expect(effectiveRole('owner', null)).toBe('owner');
  });
});

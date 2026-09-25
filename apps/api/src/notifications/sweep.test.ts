import { describe, expect, it } from 'vitest';
import { emailRolesForAlert } from './sweep';

// PRD-13 AD-27: staff alert emails follow the console's routing, and a
// needs-action alert with no routing row still reaches its owning role.
describe('emailRolesForAlert', () => {
  const distress = { kind: 'distress_escalated', category: 'act', role_owner: 'owner' };

  it('falls back to the owning role for a needs-action alert with no routing', () => {
    expect(emailRolesForAlert(distress, [])).toEqual(['owner']);
  });

  it('never emails an FYI alert without a route', () => {
    expect(
      emailRolesForAlert({ kind: 'weekly_signups', category: 'fyi', role_owner: 'support' }, []),
    ).toEqual([]);
  });

  it('follows the stored routing when there is some, including switching the owner off', () => {
    const routes = [
      { role: 'owner', alert_kind: 'distress_escalated', email: false },
      { role: 'support', alert_kind: 'distress_escalated', email: true },
    ];
    expect(emailRolesForAlert(distress, routes)).toEqual(['support']);
  });
});

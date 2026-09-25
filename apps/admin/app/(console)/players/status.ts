import type { BadgeProps } from '@deucex/ui';
import type { PlayerStatus } from '@/lib/api';

export const STATUS_BADGE: Record<PlayerStatus, BadgeProps['variant']> = {
  Active: 'ok',
  Trial: 'lime',
  'Past due': 'danger',
  Unverified: 'warn',
  Minor: 'warn',
  Dormant: 'secondary',
  Deleting: 'danger',
};

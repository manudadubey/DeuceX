// Cross-cutting types shared by every app and package.
// Kept intentionally small: this package holds constants and types the whole
// platform agrees on, not business logic (that belongs in packages/agents or
// packages/actions).

export type Tour = 'atp' | 'wta';

export type HomeCurrency = 'AUD' | 'USD' | 'CNY';

export type Units = 'metric' | 'imperial';

export type Stage = 1 | 2 | 3;

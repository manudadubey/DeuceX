-- Calendar import (28 September 2026): the currency an event's prize table is
-- published in. ITF and Challenger prize money is published in US dollars, so
-- storing it under the old assumed EUR would either misstate every prize or
-- force staff to convert before importing (a stored converted amount, against
-- the money rule). The run converts from this currency at the run-date rate.
-- Additive: existing rows keep the EUR the code assumed until now.
alter table public.tournaments
  add column prize_currency text not null default 'EUR'
    check (prize_currency ~ '^[A-Z]{3}$');

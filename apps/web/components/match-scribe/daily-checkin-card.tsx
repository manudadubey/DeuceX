import { CheckInCard } from '@/components/mindset/check-in-card';

// `#dailyMood` (PRD-02 section 4.4): the same 1-5 check-in also appears on
// the dashboard and `#/agent/mindset` (PRD-06 owns those two, step 1.3);
// components/mindset/check-in-card.tsx is the one shared implementation.
export function DailyCheckInCard({
  playerId,
  timezone,
  onToast,
}: {
  playerId: string;
  timezone: string;
  onToast: (title: string) => void;
}) {
  return (
    <CheckInCard
      playerId={playerId}
      timezone={timezone}
      source="scribe"
      description="Thirty seconds when there's nothing to record. Feeds the Mindset Coach's pattern detection."
      onToast={onToast}
    />
  );
}

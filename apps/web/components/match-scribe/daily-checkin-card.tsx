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
      title="Daily check-in"
      // The prototype's line said this "feeds pattern detection"; the pattern
      // rules read notes only. What a check-in really does: the 07:00 insight
      // reads it, and 2 or lower makes the next morning a light one (MC-17).
      description="Thirty seconds when there's nothing to record. The coach reads it at 07:00, and goes easier after a low day."
      onToast={onToast}
    />
  );
}

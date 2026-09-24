// PRD-08 section 7: "ballDiff is true when the fact-sheet ball is not in
// practiceBalls." A null ball (fact sheet hasn't published one yet) is never
// a diff — CE section 3's own failure behaviour gives it a separate tile
// state ("Ball not published yet"), not the amber "differs" state.
export function computeBallDiff(ball: string | null, practiceBalls: readonly string[]): boolean {
  if (ball === null) return false;
  return !practiceBalls.includes(ball);
}

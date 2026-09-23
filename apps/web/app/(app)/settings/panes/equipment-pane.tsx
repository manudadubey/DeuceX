import { Card, CardHeader, CardTitle, Empty } from '@procircuit/ui';

// PRD-12 §4.7 is explicit that this pane's content is "specified fully in
// PRD-08... referenced not duplicated here," and build-plan step 3.3
// ("Conditions and Equipment") is the step that actually builds it — frame,
// string, tension, frames carried, restring cadence, overgrip, practice
// balls, the "stamp notes with conditions" switch. This step reserves the
// tab, same honest-stub treatment `/coach/[token]` got from step 0.5.
export function EquipmentPane() {
  return (
    <Card className="gap-6 p-6">
      <CardHeader className="p-0">
        <CardTitle>Equipment</CardTitle>
      </CardHeader>
      <Empty title="Not built yet">
        Frame, string, tension and restring cadence arrive with Conditions and Equipment.
      </Empty>
    </Card>
  );
}

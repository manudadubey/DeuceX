// Read-only coach view (Baseline §Shells and routes: "shows no money anywhere"). The
// share-link lookup and its content are PRD-04/PRD-12 work, not yet built.
export default function CoachViewPage({ params }: { params: { token: string } }) {
  void params;
  return (
    <div className="text-center">
      <h1 className="text-base font-medium">Coach view</h1>
      <p className="mt-1 text-sm text-muted-foreground">This shared view isn&apos;t built yet.</p>
    </div>
  );
}

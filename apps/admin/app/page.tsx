// Separate deployment, separate staff auth, separate database role (PRD-13,
// register decision A18). Full console (Overview, Players, Agent health,
// Money, Trust and safety) is step 5.1. Step 3.1 adds the one real page
// this app has so far: /ingestion.
export default function AdminHomePage() {
  return (
    <main>
      <h1>DeuceX Admin</h1>
      <p>Build in progress. The full console lands in step 5.1.</p>
      <p>
        <a href="/ingestion">Ingestion →</a>
      </p>
    </main>
  );
}

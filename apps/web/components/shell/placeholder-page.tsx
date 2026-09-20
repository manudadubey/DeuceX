import { Empty } from '@procircuit/ui';

// One placeholder per step 0.5 route (docs/BUILD-PLAN-CLAUDE-CODE.md): "every route renders
// a placeholder page with the right title." The title itself comes from the topbar crumb
// (components/shell/routes.ts); this just names what will eventually live here.
export function PlaceholderPage({ description }: { description: string }) {
  return <Empty title="Coming soon">{description}</Empty>;
}

// The '@deucex/actions/content' subpath (package.json's `exports` map), kept
// off the main barrel like './fans' and './account': apps/api is its only
// real consumer, and the main barrel reaches apps/web's client bundle.
export * from './content';

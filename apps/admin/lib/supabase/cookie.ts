// The console's session cookie has its own name. In development the player
// app (localhost:3000) and the console (localhost:3001) share one cookie jar,
// since cookies are scoped by host, not port; with Supabase's default name a
// player sign-in and a staff sign-in would overwrite each other. In
// production the separate hostname (PRD-13 AD-1) keeps them apart anyway.
export const ADMIN_AUTH_COOKIE = 'sb-deucex-admin-auth';

/** The role preview in the user menu (PRD-13 section 4.1): narrows only, enforced by the API. */
export const ROLE_PREVIEW_COOKIE = 'dx-role-preview';

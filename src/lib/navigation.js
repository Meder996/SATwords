// URL-driven routing for the app shell. Keeping this pure makes the sign-in / guest-mode
// gating rules testable without rendering React.

// Screens behind the app shell: they need an account or an explicit guest session.
export const APP_PAGES = ['dashboard', 'study', 'practice', 'tutor', 'dictionary', 'analytics', 'profile'];
// Screens that stand on their own, outside the shell.
export const PUBLIC_PAGES = ['landing', 'signin'];
export const ALL_PAGES = [...PUBLIC_PAGES, ...APP_PAGES];

export const DEFAULT_PAGE = 'dashboard';

// Reads ?page=… while ignoring anything unknown, so a stale link can never break the app.
export function pageFromSearch(search = '', fallback = DEFAULT_PAGE) {
  const value = new URLSearchParams(search).get('page');
  return ALL_PAGES.includes(value) ? value : fallback;
}

// Builds the href for a page, keeping everything else in the URL untouched.
export function urlForPage(href, id) {
  const url = new URL(href);
  if (id === DEFAULT_PAGE) url.searchParams.delete('page');
  else url.searchParams.set('page', id);
  return `${url.pathname}${url.search}${url.hash}`;
}

// The single decision point for what the visitor sees.
// - accounts still loading → 'loading'
// - signed in → any app page (public pages bounce to the dashboard)
// - guest session → app pages; 'signin' stays reachable so a guest can upgrade
// - everyone else → the landing page, with 'signin' one click away
export function resolveView({ page = DEFAULT_PAGE, signedIn = false, guest = false, ready = true } = {}) {
  if (!ready) return 'loading';
  // A signed-in account always gets the app — finishing sign-in must never leave the form on screen.
  if (signedIn) return APP_PAGES.includes(page) ? page : DEFAULT_PAGE;
  // Guests keep the sign-in page reachable so they can upgrade to an account.
  if (page === 'signin') return 'signin';
  if (guest && APP_PAGES.includes(page)) return page;
  return 'landing';
}

// True when the view is the marketing page rather than the study shell.
export const isPublicView = view => PUBLIC_PAGES.includes(view) || view === 'loading';

const PRIVATE_PATH_PREFIXES = [
  '/activity-log',
  '/admin',
  '/books',
  '/chat',
  '/dashboard',
  '/diverse',
  '/lesson',
  '/parents',
  '/quick-review',
  '/quiz',
  '/review',
  '/study',
];

function normalizePathname(path: string) {
  const [pathname] = path.split(/[?#]/, 1);
  if (!pathname || pathname === '/') {
    return '/';
  }
  return pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
}

export function isPrivateAppPath(path: string) {
  const pathname = normalizePathname(path);
  return PRIVATE_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

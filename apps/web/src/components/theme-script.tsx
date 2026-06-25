import { THEME_STORAGE_KEY } from '@/lib/theme';

const themeScript = `
(function () {
  try {
    var key = '${THEME_STORAGE_KEY}';
    var stored = window.localStorage.getItem(key);
    var preference = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    var systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
    var root = document.documentElement;
    root.dataset.themePreference = preference;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  } catch (_) {}
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeScript }} />;
}

import { LOCALE_STORAGE_KEY } from '@/lib/i18n';

/*
  Sets <html lang> from the stored choice, or from the system, before the first
  paint. React cannot do this early enough: the wrong lang is what makes a
  screen reader read English with Portuguese phonetics, and what makes the
  browser offer to translate a page that is already in the reader's language.

  The text itself catches up a tick later, in LocaleProvider's layout effect.
*/
const localeScript = `
(function () {
  try {
    var key = '${LOCALE_STORAGE_KEY}';
    var stored = window.localStorage.getItem(key);
    var preference = stored === 'en' || stored === 'pt-BR' || stored === 'system' ? stored : 'system';
    var locale = preference;
    if (preference === 'system') {
      var tags = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language];
      locale = 'pt-BR';
      for (var i = 0; i < tags.length; i++) {
        var tag = String(tags[i] || '').trim().toLowerCase();
        if (!tag) continue;
        locale = (tag === 'pt' || tag.indexOf('pt-') === 0) ? 'pt-BR' : 'en';
        break;
      }
    }
    var root = document.documentElement;
    root.lang = locale;
    root.dataset.locale = locale;
    root.dataset.localePreference = preference;
  } catch (_) {}
})();
`;

export function LocaleScript() {
  return <script dangerouslySetInnerHTML={{ __html: localeScript }} />;
}

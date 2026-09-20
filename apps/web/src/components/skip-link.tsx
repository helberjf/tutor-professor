'use client';

import { t } from '@/lib/i18n';

/**
 * The first thing a keyboard reaches on every page, so it has to speak the
 * reader's language. It lives in its own client component because the layout
 * around it is a server component, where the active locale is never set.
 */
export function SkipLink() {
  return (
    <a href="#main-content" className="skip-link">
      {t('Pular para o conteúdo')}
    </a>
  );
}

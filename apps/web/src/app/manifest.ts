import type { MetadataRoute } from 'next';

/**
 * Served at /manifest.webmanifest, which is what makes the app installable.
 *
 * iOS does not read the icons from here for the home screen — it uses the
 * apple-touch-icon that Next emits from src/app/apple-icon.png — so both have
 * to stay in place for iPhone and iPad.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tutor and Professor',
    short_name: 'Tutor',
    description:
      'Licoes, revisoes e estudos guiados em um app seguro e acolhedor.',
    lang: 'pt-BR',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#F8FAFC',
    theme_color: '#0EA5E9',
    categories: ['education', 'kids'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        // Cropped to a circle by Android launchers, so it carries its own
        // padding and bleeds the gradient to the edge.
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      { name: 'Estudos', url: '/study' },
      { name: 'Licao do dia', url: '/lesson' },
      { name: 'Revisao', url: '/review' },
    ],
  };
}

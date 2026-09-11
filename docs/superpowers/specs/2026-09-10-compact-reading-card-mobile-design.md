# Compact mobile reading card

## Goal

Improve the mobile reading experience in `TopicView` by reducing the vertical space occupied above the reading content and ensuring that the navigation controls are always fully visible.

## Scope

The change applies to the full-screen topic reading modal on mobile viewports. Tablet and desktop layouts retain their current sizing unless a shared structural fix is necessary for correct flex sizing.

## Header design

- Make the default mobile header no taller than approximately `10rem`, about half the height of the previously proposed compact option A. Expanded error and AI-deepening content may grow beyond this target.
- Ensure the reading modal covers the global `Tutor pessoal` navigation area so that it does not consume vertical space while the modal is open.
- Reduce mobile-only padding, gaps, heading size, and progress-bar height.
- Keep the topic title readable and preserve the subject name and step indicator.
- Place the font-size controls, `Ouvir`, and `Aprofundar com IA` on one compact row at every supported mobile width (`320px` and wider).
- Keep the visible labels `Ouvir` and `Aprofundar com IA`; do not shorten the AI action to `IA`.
- Preserve accessible names and touch targets for all controls.

## Reading area

- The reading body remains the only vertically scrollable region.
- Add the flex constraints needed to prevent the content from pushing the footer below the viewport.
- Do not reduce the reader-selected body font size or alter the reading content.

## Footer design

- Keep `Anterior` and `Próximo` fixed at the bottom of the modal while the reading body scrolls.
- Reduce the visual size of both navigation buttons by approximately 30% on mobile by tightening padding, gap, icon size, and text size.
- Keep both buttons large enough to remain comfortably tappable.
- Respect `env(safe-area-inset-bottom)` so the buttons are not clipped by the iPhone home indicator or browser chrome.
- Preserve the current two-column layout and disabled state of `Anterior` on the first step.

## Accessibility and behavior

- No reading, speech, AI-deepening, font-size, progress, or step-navigation behavior changes.
- Existing ARIA labels remain intact.
- The close action remains clearly visible and tappable.
- Desktop responsive styles remain unchanged.

## Verification

- Add a static regression check for the mobile compact-header classes, full-length action labels, scroll containment, compact footer sizing, and safe-area padding.
- Run the focused regression check first and confirm that it fails before implementation.
- Run the focused check, TypeScript typecheck, and the relevant existing topic-reading tests after implementation.
- Visually verify a narrow mobile viewport to confirm that the header is substantially shorter and both footer buttons are fully visible.

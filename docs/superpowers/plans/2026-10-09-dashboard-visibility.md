# Dashboard visibility repair implementation plan

**Goal:** Repair the reported dashboard contrast and restore missing study details while keeping history and charts accurate.

**Architecture:** Keep the existing API and dashboard layout. Repair shared neutral surface theme coverage, and correct rendering and request states in the existing components.

**Tech Stack:** Next.js, React, TypeScript, Tailwind, Node render checks, Python CSS coverage checks, Chromium.

- [x] Extend the dark theme coverage check to include opaque neutral surfaces with opacity modifiers; observe its failure before adding the missing CSS selectors.
- [x] Add real component rendering checks for singular/plural question counts, topics returned by the API, historical dates and empty/failing period data; observe failures before changes.
- [x] Repair overview rendering, historical fallback dates, stale request data, error/loading visibility and narrow screen text wrapping.
- [x] Verify weekly bars scale with daily totals using rendered styles; repair scale and refresh error recovery.
- [x] Run targeted regressions, TypeScript, lint and build. Request an independent code review and resolve material findings.
- [ ] Verify desktop/mobile and light/dark rendering in Chromium, publish the isolated frontend correction, and verify the production dashboard.

Baseline: existing dark mode coverage (85 classes) and client dashboard checks passed. Production Chromium reproduced a light question card with pale text and the text `63 questãoões resolvidas`. Other identified causes: historical axes always say Hoje, fallback dates ignore the selected window, weekly bars fill every active day to 100%, topic_names is returned but never rendered.

Verification: 8 render regressions and 4 asynchronous refresh race cases pass after failing on the original behavior. Dark theme coverage includes 95 classes. Client dashboard, accessibility, product copy/contrast checks pass. Independent review found and verified fixes for cached page disappearing after a failed refresh and older refresh responses replacing newer data. Chromium confirmed topic expansion, readable dark/light question cards and correct previous-window dates. At 320 px, document width was 320 px and no main element extended outside the viewport. Local QA used a disposable API fixture; no production study records were modified. Before publication, the isolated branch was advanced to the latest main (23dea8d) to preserve the concurrent objectives release.

# Performance gaps and follow-up ownership

Recorded 2026-07-16. These are explicit limits of the current release evidence, not waived failures.

| Gap | Reproduction / evidence | Severity | Owner | Required closure |
|---|---|---|---|---|
| Host memory pressure is not observable in a portable Playwright assertion | The 64/128/256 MiB suite records exact file size and recovery but has no reliable cross-engine peak/available memory API | Medium | Release engineering | Run headed Safari/Firefox/Chromium profiles on a low-memory host; capture OS memory pressure, WASM heap, and safe-degradation state without changing caps |
| Worker transfer and long-task traces are not portable release metrics | `SEEQLITE_PERF` records user-visible timings; Playwright resource entries cannot expose structured-clone transfer bytes or WASM worker internals | Medium | Performance engineering | Add a browser-specific trace harness or DevTools protocol capture for transfer/long-task evidence; keep structural bounds hard in all engines |
| Constrained-host memory pressure is not observable in a portable Playwright assertion | The exact 25/50 MiB catalog matrix now passes safe mode in all three engines, but the runner does not provide reliable cross-engine peak/available memory signals | Medium | Release engineering | Run headed Safari/Firefox/Chromium profiles on a low-memory host; capture OS memory pressure, WASM heap, and safe-degradation state without changing caps |
| Current released Safari/VoiceOver and Windows NVDA timing/interaction evidence remains manual | Automated WebKit/axe/keyboard tests pass, but assistive technology and real update/reload behavior require host sessions | Medium | Accessibility/release engineering | Record dated Safari/VoiceOver and NVDA sessions, including forced colors, 200% zoom, reduced motion, and offline update/reload |

No production limit was raised to close these gaps. Until the host-specific evidence exists, the qualified claim is limited to the profile and structural guarantees in `docs/release/performance.md`.

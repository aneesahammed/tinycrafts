# Tests

Run the Node suite from the MarkV directory:

```sh
node --test tests/*.test.cjs
```

Run the onboarding browser suite:

```sh
node tests/onboarding.browser.cjs
```

The browser suite requires Bun and an installed gstack `/browse` executable.
It finds the usual user skill locations, or accepts `GSTACK_BROWSE_BIN` and
`BUN_BIN` overrides. It creates its own temporary Chromium session and random
local origin, preserving existing browser tabs, files, and MarkV storage.

It checks first-install navigation count, mobile Reading settings, both themes,
privacy information, file/folder picker cancellation, guide preferences,
PDF preparation, delayed navigation, draft recovery, and cached offline startup.
Print and picker boundaries are intercepted; no files are opened or exported.
The local server, browser, and temporary state are cleaned up after the run.

The Node onboarding tests exercise the startup coordinator, document request
ordering, and service-worker activation/update events against controlled I/O.

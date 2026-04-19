# Folder Library Design

Date: 2026-04-19

## Summary

Add a calm, left-side library drawer to the markdown reader so users can add multiple local folders, browse a markdown-only tree, open files directly from that tree, and automatically resume the last file they were reading across sessions.

The feature should preserve the current product position: the app is primarily a reading and comprehension tool, not a general file manager. The library exists to support long-form reading, not to dominate the interface.

## Goals

- Let users add multiple folders to a persistent library.
- Show a left-side tree view with only markdown-compatible files and folders that contain them.
- Keep the reading canvas visually dominant through a gentle drawer pattern.
- Reopen the last file the user was reading when the app starts again.
- Preserve compatibility with the existing render pipeline, reading settings, theme system, and comprehension features.
- Handle lost permissions and empty folders gracefully.

## Non-Goals

- Broad browser fallback for persistent multi-folder libraries.
- Full filesystem management such as rename, move, delete, or create.
- Arbitrary file-type browsing outside markdown-compatible content.
- Changing the existing preview, editing, ontology, mindmap, or chat feature sets.

## Chosen Approach

Use the native File System Access API with `showDirectoryPicker()` and persist directory handles in IndexedDB.

Rationale:

- It is the only clean way to support multiple folders and automatic last-file restore across sessions.
- It fits the app's existing reliance on modern browser capabilities.
- It avoids building a weak compatibility layer that cannot reliably preserve access or resume state.

If the current browser environment does not support the required API or is not in a secure context, the UI should explain that persistent folder libraries require File System Access support and leave the rest of the reader usable.

### Platform Notes

- Persistent folder libraries require `showDirectoryPicker()` plus a secure context.
- Treat mobile and tablet browsers as unsupported unless those capabilities are actually present at runtime. In practice, iOS Safari and many mobile browsers will fall through the unsupported-browser path.
- The library should align with the app's current file support rather than widening the document surface in v1.

## UX Design

### Entry Point

Add a `Library` control to the top toolbar. Activating it opens a left-side drawer with the same restrained motion and calm surface treatment used elsewhere in the app.

### Drawer Behavior

- The drawer slides in from the left with a soft overlay.
- It traps focus while open.
- It closes on outside click, `Escape`, and an explicit close control.
- On small screens, choosing a file closes the drawer automatically.
- On larger screens, the drawer may remain open during browsing.
- The library drawer is mutually exclusive with the existing global settings drawer. Opening one closes the other first.
- Escape closes the topmost overlay-style surface that currently owns focus. Non-overlay surfaces such as the reading panel continue to use their existing local Escape rules when the library drawer is not active.

### Library Contents

Each added folder appears as a top-level library section with:

- Folder name
- Permission or loading state when relevant
- Expand/collapse affordance
- Nested markdown tree

The tree should include:

- Files with extensions `.md`, `.markdown`, `.mdown`, `.mkdn`, or `.txt`
- Only directories that contain at least one supported file somewhere in their subtree

The tree should exclude unrelated files so the experience stays quiet and reading-focused.

Additional rules:

- Extension matching is case-insensitive.
- `.mdx` is intentionally excluded in v1. The current reader is scoped to Markdown text documents and does not define MDX component execution semantics.
- Tree rows sort directories before files, then use case-insensitive natural sort within each group.
- If two saved folders share the same display name, the UI appends a stable ordinal suffix such as `notes (2)` for disambiguation.

### Active File

When a file is selected:

- The file loads into the existing reader surface immediately.
- The selected tree node is visually marked as active.
- The app persists that file as the new resume target.

### Empty And Informational States

- Empty folder: show a soft "No markdown files found in this folder" state.
- Unsupported browser: show a calm explanatory message near the add-folder action.
- Revoked permission: keep the folder visible and mark it as needing reauthorization.

### Folder Management Actions

The library supports lightweight management actions that do not mutate the user's filesystem:

- Add folder
- Refresh folder
- Reauthorize folder
- Remove folder from the library

Ordering metadata exists to preserve insertion order across sessions. Manual drag-to-reorder is not part of v1. Filesystem rename, move, delete, and create actions remain out of scope.

### Permission Lifecycle

Persisted directory handles do not imply persisted read permission. The app must model permission as a recoverable runtime state.

- Startup restore uses `queryPermission({ mode: "read" })` only.
- Startup restore must not call `requestPermission()` because re-prompting requires direct user activation.
- Folders whose permission state is `prompt` or `denied` render as `needs-permission`.
- A user-clicked `Reauthorize` action calls `requestPermission({ mode: "read" })`.
- Selecting a file inside a `needs-permission` folder routes through the same reauthorization path before file reading begins.

## Architecture

Implement the feature as a contained library subsystem inside `markv/index.html` with clear internal separation even if the file remains single-file for now.

### Subsystems

1. Library UI
   Responsible for drawer DOM, overlay, buttons, tree rendering, active states, and accessibility behavior.

2. Library State
   Responsible for in-memory folder records, expanded nodes, selected file metadata, loading states, and restore state.

3. Library Storage
   Responsible for IndexedDB persistence of folder handles and lightweight metadata.

4. Library Loading
   Responsible for recursively scanning directory handles, building a filtered tree, resolving file handles, and reopening the last file.

## Data Model

### In-Memory Folder Record

Each saved folder should track:

- `id`: stable app-generated identifier
- `name`: folder display name
- `displayLabel`: UI-safe label after duplicate-name disambiguation
- `handle`: `FileSystemDirectoryHandle`
- `tree`: filtered markdown tree
- `status`: `ready`, `loading`, `empty`, or `needs-permission`
- `expandedPaths`: set of expanded relative paths
- `scanRevision`: monotonically increasing token for cancelling stale scan work
- `lastScannedAt`: timestamp of the last completed tree rebuild

### Tree Node

Each tree node should track:

- `type`: `directory` or `file`
- `name`
- `path`: path relative to the saved folder root
- `children` for directories
- `fileHandle` for files

### Persisted Metadata

Store lightweight metadata separately from handles:

- Folder ordering
- Expanded directory paths
- Last active folder id
- Last active file relative path
- Duplicate-name counters used to restore stable display labels

## Persistence Design

Use a dedicated IndexedDB database for the library feature rather than reusing the existing secrets store.

Reasoning:

- The library and encrypted AI-key storage are unrelated concerns.
- Separate versioning reduces migration risk.
- Folder handles and UI metadata should not be coupled to security-sensitive records.

### What To Persist

- Directory handles for each saved folder
- Folder metadata keyed by folder id
- Global resume metadata for the last active file

### What Not To Persist

- Rendered HTML
- Full file contents
- Derived tree HTML

The tree should be rebuilt from live handles on startup so it reflects the current folder contents.

### IndexedDB Schema v1

Use a dedicated IndexedDB database named `md-viewer-library` with version `1`.

Object stores:

- `folders`
  Key path: `id`
  Value shape: `{ id, name, handle, addedAt }`
- `libraryMeta`
  Key path: `key`
  Values:
  - `{ key: "folderOrder", value: string[] }`
  - `{ key: "expandedPathsByFolder", value: Record<string, string[]> }`
  - `{ key: "lastActiveFile", value: { folderId: string, path: string } | null }`

Upgrade behavior:

- `onupgradeneeded` creates any missing stores.
- Version upgrades must be additive and must not drop existing folder handles or resume metadata without an explicit migration.

### Scan Limits And Ignores

Scanning must stay bounded and cancellable so large developer folders do not freeze the reader.

- Ignore entries named `.git`, `node_modules`, `.next`, `dist`, `build`, `.turbo`, and `.DS_Store`.
- Skip hidden metadata files that cannot ever become supported reader inputs.
- Cap recursion depth at 12 nested directories.
- Cap scanned supported files at 2000 per saved folder.
- Cap saved folders at 12 in v1.
- Chunk long scans so control returns to the event loop between batches.
- Cancel stale scans when a newer scan for the same folder starts or when a folder is removed from the library.
- Drawer close alone does not need to cancel a useful in-flight scan.

## App Flow

### Add Folder

1. User clicks `Add folder`.
2. App calls `showDirectoryPicker()`.
3. If a folder is chosen, app assigns a folder id and persists the handle.
4. App scans the directory recursively and builds the filtered markdown tree.
5. Drawer updates to show the new folder section.
6. Exact duplicate folders and ancestor-descendant overlaps are rejected with a clear explanation rather than creating ambiguous duplicate trees.

### Refresh Folder

1. User clicks `Refresh` on a saved folder.
2. App starts a fresh bounded scan for that folder and cancels any stale scan already in progress for it.
3. When the scan completes, the tree replaces the previous snapshot in place.

### Reauthorize Folder

1. User clicks `Reauthorize` on a folder in `needs-permission` state.
2. App calls `requestPermission({ mode: "read" })` from that user gesture.
3. If permission is granted, the folder rescans immediately.
4. If permission remains unavailable, the folder stays visible in `needs-permission` state.

### Remove Folder

1. User clicks `Remove from library` on a saved folder.
2. App deletes that folder's handle and metadata from IndexedDB.
3. If the removed folder owned the current resume target, the resume target is cleared.
4. Removing a folder from the library does not delete anything from disk.

### Startup Restore

1. App loads saved folder handles and metadata from IndexedDB.
2. If the app restored unsaved editor content from the current session, that draft takes precedence and library auto-restore is skipped.
3. For each folder, app calls `queryPermission({ mode: "read" })`.
4. Readable folders are rescanned into a fresh tree.
5. Folders in `prompt` or `denied` state remain visible with `needs-permission` status.
6. If the saved last file can be resolved and no dirty editor draft took precedence, the app opens it automatically.
7. If the last file cannot be resolved, the library still restores and the user can choose a file manually.
8. Tree freshness after startup is explicit rather than magical. External filesystem changes that happen while the app is open appear only after a user-triggered folder refresh.

### File Selection

1. User selects a file node in the tree.
2. If that folder is in `needs-permission` state, the app runs the reauthorization flow first.
3. App resolves the `FileSystemFileHandle`.
4. App reads file text and passes it through the existing render path.
5. App updates active selection and persists resume metadata.

## Integration With Existing Reader

Add a new load path for library-based files instead of reusing the current single-file handle assumptions directly.

Recommended integration:

- Introduce a dedicated loader such as `loadFromLibraryFile(folderId, fileRef)`.
- Set a distinct `sourceMode` such as `library`.
- Keep `render()` unchanged apart from recognizing the new source token.
- Continue using the existing preview, theme, reading settings, highlight, ontology, chat, and mindmap flows without duplicating logic.

This keeps the library as a document source, not a second rendering system.

## Failure Modes

### Permission Revoked

If a saved folder becomes unreadable:

- Keep it in the library.
- Mark it as needing reauthorization.
- Do not silently remove it.
- Emit a user-visible status update and a `console.warn` entry with the folder id and failure reason when available.

### Last File Missing

If the stored last file no longer exists:

- Restore the folder library normally.
- Skip automatic file restore.
- Leave the user in the last known library context.
- Emit a non-blocking status update and a `console.warn` entry so the failure is visible during debugging.

### Empty Folder

If a folder contains no supported files:

- Keep it in the library.
- Mark it as empty.
- Avoid showing unrelated files.

### Unsupported Browser

If File System Access is unavailable:

- Disable or soften the add-folder control.
- Explain that persistent folder libraries require a supported browser context.

### Large Or Ambiguous Libraries

If a folder exceeds scan limits or would create ambiguous duplication:

- Keep the library stable rather than partially rendering an unbounded tree.
- Surface a clear explanation for limit hits, duplicate roots, and overlap rejection.
- Prefer predictable omission to silently degraded behavior.

## Accessibility

- The drawer must trap focus while open.
- The tree must support keyboard navigation and clear active state.
- Expand/collapse controls must expose state with `aria-expanded`.
- The active file should be announced through the app's existing `#liveRegion` element and `announce()` helper pattern already used in `markv/index.html`.
- Escape behavior must remain predictable when the drawer is open.

## Observability

- Permission loss, missing last-file targets, rejected duplicate folders, overlap rejection, and scan-limit failures should emit both a calm user-facing status message and a matching `console.warn` entry.
- Normal folder scans and successful restore flows do not require analytics-style telemetry in v1.
- Observability should support debugging silent restore failures without introducing external tracking requirements.

## Testing Strategy

Preferred verification:

- Browser-level acceptance checks against the static reader app.
- Pure helper validation for tree filtering, sorting, overlap rejection, and resume serialization.
- Manual verification remains acceptable while the repo lacks a committed browser automation harness.

Acceptance thresholds:

- Restoring folder metadata and deciding resume precedence should complete within 150 ms on a warm startup path before any folder scan begins.
- Scanning a folder with up to 500 supported files should keep the UI responsive and complete within 2 seconds on a typical developer laptop.
- Reopening the last readable file after restore should complete within 1 second once its containing folder scan has resolved.

### Functional Checks

- Adding multiple folders persists them across reloads.
- Folder scans produce only markdown-compatible trees.
- Exact duplicates and ancestor-descendant overlaps are rejected cleanly.
- Selecting a tree file loads the correct document.
- The last file restores automatically on startup.
- Dirty editor drafts suppress automatic last-file restore.
- Revoked permissions surface as visible recoverable states.
- Empty folders render a clear non-error state.
- Manual refresh updates a folder tree after external filesystem edits.

### Interaction Checks

- Drawer open and close behavior works via mouse and keyboard.
- Focus trap and `Escape` behavior are correct.
- Active file highlighting updates reliably.
- Mobile selection closes the drawer appropriately.

### Regression Checks

- Existing manual open-file flow still works.
- Existing editor and preview rendering still work.
- Reading settings, theme, and comprehension features still apply to library-opened files.

## Implementation Notes

- Prefer small pure helpers for tree filtering, relative-path matching, and persistence serialization.
- Keep drawer logic modeled after the existing settings drawer so the app does not gain a second interaction language.
- Treat the library as a calm support layer for reading, not the app's visual center.
- Keep the document ASCII-only so future prompt and tooling stages do not have to normalize typographic punctuation.

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

## UX Design

### Entry Point

Add a `Library` control to the top toolbar. Activating it opens a left-side drawer with the same restrained motion and calm surface treatment used elsewhere in the app.

### Drawer Behavior

- The drawer slides in from the left with a soft overlay.
- It traps focus while open.
- It closes on outside click, `Escape`, and an explicit close control.
- On small screens, choosing a file closes the drawer automatically.
- On larger screens, the drawer may remain open during browsing.

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

### Active File

When a file is selected:

- The file loads into the existing reader surface immediately.
- The selected tree node is visually marked as active.
- The app persists that file as the new resume target.

### Empty And Informational States

- Empty folder: show a soft “No markdown files found in this folder” state.
- Unsupported browser: show a calm explanatory message near the add-folder action.
- Revoked permission: keep the folder visible and mark it as needing reauthorization.

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
- `handle`: `FileSystemDirectoryHandle`
- `tree`: filtered markdown tree
- `status`: `ready`, `loading`, `empty`, or `needs-permission`
- `expandedPaths`: set of expanded relative paths

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

## App Flow

### Add Folder

1. User clicks `Add folder`.
2. App calls `showDirectoryPicker()`.
3. If a folder is chosen, app assigns a folder id and persists the handle.
4. App scans the directory recursively and builds the filtered markdown tree.
5. Drawer updates to show the new folder section.

### Startup Restore

1. App loads saved folder handles and metadata from IndexedDB.
2. For each folder, app attempts to read permission status.
3. Readable folders are rescanned into a fresh tree.
4. Unreadable folders remain visible with `needs-permission` status.
5. If the saved last file can be resolved, the app opens it automatically.
6. If the last file cannot be resolved, the library still restores and the user can choose a file manually.

### File Selection

1. User selects a file node in the tree.
2. App resolves the `FileSystemFileHandle`.
3. App reads file text and passes it through the existing render path.
4. App updates active selection and persists resume metadata.

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

### Last File Missing

If the stored last file no longer exists:

- Restore the folder library normally.
- Skip automatic file restore.
- Leave the user in the last known library context.

### Empty Folder

If a folder contains no supported files:

- Keep it in the library.
- Mark it as empty.
- Avoid showing unrelated files.

### Unsupported Browser

If File System Access is unavailable:

- Disable or soften the add-folder control.
- Explain that persistent folder libraries require a supported browser context.

## Accessibility

- The drawer must trap focus while open.
- The tree must support keyboard navigation and clear active state.
- Expand/collapse controls must expose state with `aria-expanded`.
- The active file should be announced through the app’s existing live-region pattern.
- Escape behavior must remain predictable when the drawer is open.

## Testing Strategy

Focus on behavior-level verification.

### Functional Checks

- Adding multiple folders persists them across reloads.
- Folder scans produce only markdown-compatible trees.
- Selecting a tree file loads the correct document.
- The last file restores automatically on startup.
- Revoked permissions surface as visible recoverable states.
- Empty folders render a clear non-error state.

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
- Treat the library as a calm support layer for reading, not the app’s visual center.

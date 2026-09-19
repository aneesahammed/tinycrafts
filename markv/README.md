# MarkV

MarkV is a static Markdown reader and visual editor. Serve this directory with any static HTTP server and open `index.html`.

## Visual editing

Choose **New** or **Edit** to write visually. The toolbar supports headings 1–6, bold, italic, strikethrough, inline and fenced code, bullet/numbered/task lists, quotes, links, images, horizontal rules, and tables. Table actions add/remove rows and columns. Standard undo/redo and bold/italic shortcuts work; **Cmd/Ctrl+Shift+K** edits a link. **Cmd/Ctrl+K** continues to open the app command palette.

Documents continue to save and export as Markdown. Opening a file does not rewrite its source; visual edits normalize Markdown formatting. Use **Markdown source** to edit the original syntax. Documents containing HTML, reference definitions, footnotes, or other detected extensions open in source mode to preserve their content. Images are inserted using URLs or relative paths, not uploaded to a server.

## Development

Requires Node.js 22 or later.

```sh
npm ci
npm run build
npm test
```

`src/visual-editor.js` contains the Tiptap adapter; `assets/visual-editor.css` contains theme-aware styles. The checked-in `assets/visual-editor.js` bundle allows static hosting and offline use without fetching editor dependencies from a CDN. Rebuild it after changing the source. When changing cached assets, bump their query versions in `index.html` and `sw.js`, and the service-worker cache version.

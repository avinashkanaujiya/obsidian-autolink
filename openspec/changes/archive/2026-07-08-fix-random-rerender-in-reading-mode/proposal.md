## Why

Every vault event that triggers a cache refresh (file create/delete/rename, metadata change, settings change) unconditionally calls `previewMode.rerender(true)` on **all** open reading-mode views. This causes visible flicker, scroll-reset, and unnecessary DOM rebuilds.

Two distinct scenarios cause this:
1. **Irrelevant files**: A file outside linker directories changes — the prefix tree is untouched but views still rerender.
2. **Relevant files with unchanged linking terms**: A file inside linker directories has its frontmatter modified by another plugin (e.g., a highlighter adding annotations), changing the mtime but NOT the basename, aliases, or custom linking fields. The tree re-indexes the file with identical terms — a no-op that still triggers a full rerender and scroll reset.

Both scenarios are fixed by two complementary guards.

## What Changes

- Track a `dirty` flag on the prefix tree; only rerender when the tree actually changed.
- Fingerprint each file's linking-relevant metadata (basename, aliases, custom fields, case-sensitivity tags). Skip tree mutation when the fingerprint is unchanged — even if mtime changed.
- Remove the unconditional `rerender(true)` from the cache refresh path.

## Capabilities

### New Capabilities

- `smart-reading-rerender`: Scope reading-mode rerenders to only the views that could be affected by a cache change, eliminating unnecessary full-view flicker.

### Modified Capabilities

<!-- None -->

## Impact

- **`main.ts`**: `scheduleCacheRefresh()` and `rerenderReadingViews()` — replaces the blanket rerender loop with a targeted approach.
- **`linker/linkerCache.ts`**: `PrefixTree.updateTree()` / `LinkerCache.updateFiles()` / `LinkerCache.rebuildCache()` — may need to report whether the tree actually changed.
- No API, settings, or dependency changes.

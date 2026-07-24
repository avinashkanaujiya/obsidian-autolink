## Why

After a LingQ (candidate-link store) or cache change, `scheduleCacheRefresh()` still calls `rerenderReadingViews()`, which forces `previewMode.rerender(true)` on every open reading-mode leaf. On a large note this teardown–rebuild can reset scroll and yank the reader out of their place. Users who want a fresh render can already close and reopen the tab, or trigger Obsidian's manual refresh — the plugin does not need to do it for them on every vault event.

## What Changes

- Remove the reading-mode rerender from `scheduleCacheRefresh()`. The cache is still rebuilt and live-preview decorations still update (cheap, no scroll side effect); reading-mode tabs render once on open and stay put.
- Delete the now-unused `PrefixTree.dirty` flag, `LinkerCache.isCacheDirty()`, and `LinkerCache.clearCacheDirty()`.
- Keep the linking-metadata fingerprint optimization in `PrefixTree` — it still avoids unnecessary tree mutations on no-op metadata edits, independent of any rerender.
- Keep the `file-open` highlight rerender (different code path, serves the virtual-link-click flow).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `smart-reading-rerender`: Replace the "rerender only when dirty" requirement with a "never rerender from the cache-refresh path" requirement. Remove the now-dead `PrefixTree.dirty` and `LinkerCache` dirty-API requirements. Keep the fingerprint requirement (still useful for skipping tree mutations).

## Impact

- **`main.ts`** `scheduleCacheRefresh()`: drop the `if (cache.isCacheDirty()) { this.rerenderReadingViews(); … }` block. `rerenderReadingViews()` becomes unused; delete it.
- **`linker/linkerCache.ts`**: remove `PrefixTree.dirty` field, `isCacheDirty()`, `clearCacheDirty()`. Leave the fingerprint map and `addFileToTree` short-circuit intact.
- **`tests/main.test.ts`**: drop the `isCacheDirty` / `clearCacheDirty` mock plumbing on the two test cases that set them up.
- No settings, no public API, no dependency changes. No behavior change for live preview (CM6 decoration update stays).

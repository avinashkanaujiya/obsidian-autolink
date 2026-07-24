## Context

Today, every event that schedules a cache refresh (file create/delete/rename, metadata change, settings change, initial metadata-cache resolution) funnels through `LinkerPlugin.scheduleCacheRefresh()` in `main.ts`. After the cache update, that timer fires this block:

```ts
if (cache.isCacheDirty()) {
    this.rerenderReadingViews();
    cache.clearCacheDirty();
}
this.updateManager.update();
```

`rerenderReadingViews()` iterates every leaf, filters to `MarkdownView` instances in preview mode, and calls `previewMode.rerender(true)` — a full DOM teardown/rebuild. On a large note the teardown resets scroll, so the reader loses their place. The `dirty` guard (added in the previous `smart-reading-rerender` change) already avoids most no-op rerenders, but any time the prefix tree actually mutates — adding or removing a candidate file, for example — every open reading tab still flickers and rescrolls.

The fingerprint optimization (`PrefixTree.linkingFingerprints`) still earns its keep: it short-circuits `addFileToTree` when a file's linking metadata is unchanged, so the tree stays untouched for noise edits (highlight plugins, tag tweaks unrelated to linking). That value is independent of any rerender and stays.

The user can already get a fresh render the normal Obsidian way: close & reopen the tab, or trigger Obsidian's manual re-parse. The plugin should not do this for them on every vault event.

## Goals / Non-Goals

**Goals:**
- `scheduleCacheRefresh()` no longer causes reading-mode tabs to rerender.
- The `dirty` field, `isCacheDirty()`, and `clearCacheDirty()` are removed (no callers after this change).
- Live-preview behavior is unchanged — `updateManager.update()` keeps firing so CM6 decorations stay in sync.
- The `file-open` highlight rerender (different code path, used after a virtual-link click) is preserved.

**Non-Goals:**
- Per-view precision rerender (deciding which view is affected).
- Adding a manual "refresh virtual links" command. Obsidian's existing close/reopen and reparse cover the user need.
- Touching the live-preview decoration pipeline.

## Decisions

### Decision 1: Delete the rerender block in `scheduleCacheRefresh()`

Replace the four-line `if (cache.isCacheDirty()) { … }` block with nothing — `updateManager.update()` becomes the sole post-cache-update action.

**Rationale:** Smallest possible diff at the call site. Reading-mode tabs render once on open via the registered markdown post-processor (`GlossaryLinker`) and stay put until the user reopens.

**Alternative considered:** Move the rerender behind a setting (default off). Rejected — adds a setting for a feature most users will never touch, and the user's stated preference is that no rerender is needed at all.

### Decision 2: Delete `rerenderReadingViews()` and the dirty plumbing

Remove the `rerenderReadingViews()` private method in `main.ts`, the `dirty` field on `PrefixTree`, and the `isCacheDirty()` / `clearCacheDirty()` methods on `LinkerCache`. Also drop the `// ponytail: single dirty flag…` comment that justified them.

**Rationale:** With no caller, the dirty flag and its API are dead code. The fingerprint map is the only "did the linking metadata change?" signal we still need, and it lives on its own.

**Alternative considered:** Keep the `dirty` flag in case some future feature wants it. Rejected — YAGNI; trivially re-addable from git when needed.

### Decision 3: Keep `PrefixTree.linkingFingerprints`

The fingerprint short-circuits tree mutation when linking metadata is unchanged. With no rerender, dirty tracking is gone, but skipping a no-op `removeFileFromTree` + `addFileWithName` round-trip is still a real saving for large vaults and frontmatter-heavy files.

**Rationale:** Decoupled from the rerender concern — the optimization stands on its own.

### Decision 4: Drop the test mocks for the removed methods

The two `scheduleCacheRefresh` tests in `tests/main.test.ts` set up `isCacheDirty` / `clearCacheDirty` mocks and assert `rerenderReadingViews` was called. Both go away: the `isCacheDirty` / `clearCacheDirty` mock properties and the `rerenderReadingViews` jest mock on the plugin are removed, and the `expect(plugin.rerenderReadingViews).toHaveBeenCalled()` assertion is dropped. `updateManager.update` is still asserted.

**Rationale:** Tests should match the new contract — cache refresh updates the live preview, never the reading view.

## Risks / Trade-offs

- **[Risk] A reading-mode tab now shows stale virtual links after the LingQ store changes (new candidate file added, alias changed, etc.).** → **Mitigation:** The user closes & reopens, or runs Obsidian's reparse. Document in the commit message; the old behavior caused more harm (scroll reset on large notes) than the new behavior causes (occasional stale link until reparse).
- **[Risk] Removing the `dirty` field breaks a downstream consumer I haven't found.** → **Mitigation:** Repo-wide grep for `isCacheDirty`, `clearCacheDirty`, and `.dirty` on `PrefixTree` / `LinkerCache` shows only `main.ts` and the two test cases. No other call sites.
- **[Trade-off] Fingerprint map still costs ~`O(files in linker dirs)` strings.** → **Acceptable:** Same memory budget as before; it's the tree-mutation savings, not the rerender savings, that justify it now.

## Migration Plan

No data migration, no settings migration, no release-notes flag. The change is behavior-only and the user-visible effect is that reading-mode tabs no longer flicker on vault events. Users who want a fresh render use Obsidian's existing close/reopen.

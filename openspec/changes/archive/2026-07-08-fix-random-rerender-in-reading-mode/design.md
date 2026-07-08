## Context

Currently, `scheduleCacheRefresh()` in `main.ts` unconditionally calls `rerenderReadingViews()` after every cache refresh. `rerenderReadingViews()` iterates all leaves, finds every `MarkdownView` in preview mode, and calls `previewMode.rerender(true)` — a full DOM teardown and rebuild. Cache refreshes fire on every vault metadata-change event (frontmatter edits, tag updates), file create/delete/rename, and settings changes. Most of these events affect files that are not linker candidates (outside linker directories, excluded by tags), resulting in zero changes to the prefix tree — yet every open reading tab still flickers.

The `PrefixTree.updateTree()` method already skips files that haven't changed (`fileIsUpToDate` check), so when an unrelated file triggers a cache refresh, the tree is untouched. We can surface this information to decide whether a rerender is needed.

## Goals / Non-Goals

**Goals:**
- Eliminate reading-mode rerenders when the prefix tree was not meaningfully modified.
- Skip tree mutation when a file's linking-relevant metadata hasn't changed (even if mtime changed due to non-linking frontmatter edits).

**Non-Goals:**
- Per-view precision (detecting which specific views need rerender and which don't).
- Changes to live-preview rerender logic (`updateManager.update()`). Live preview uses CM6 decorations which are cheap to reapply.

## Decisions

### Decision 1: Track a `dirty` flag on `PrefixTree`

Add a boolean `dirty` field to `PrefixTree`. Set it to `true` in `addFileToTree()` (when a file is actually added) and in `removeFileFromTree()` (when a file is removed). Reset it in `clear()`.

Expose via `LinkerCache`:
- `isCacheDirty(): boolean` — returns `this.cache.dirty`
- `clearCacheDirty(): void` — sets `this.cache.dirty = false`

**Rationale:** The tree is the single source of truth for what the linker knows. If it didn't change, views don't need updating. This is the simplest signal that captures all meaningful changes.

**Alternative considered:** Track modified file paths and map them to views. Rejected — requires maintaining a reverse index from file path to views that reference it, which is fragile and complex for marginal gain.

### Decision 2: Guard `rerenderReadingViews()` behind the dirty flag

In `scheduleCacheRefresh()`, after the cache update:
```typescript
if (cache.isCacheDirty()) {
    this.rerenderReadingViews();
    cache.clearCacheDirty();
}
this.updateManager.update(); // live preview always updates (cheap)
```

**Rationale:** One conditional at the call site. `updateManager.update()` is kept unconditional because CM6 decoration updates are lightweight.

### Decision 3: Fingerprint linking-relevant metadata per file

Store a fingerprint (hash string) of the data that actually affects linking: basename, aliases, custom field values, case-sensitivity tags, and directory inclusion status. In `addFileToTree`, compute the fingerprint BEFORE removing the old nodes. If it matches the stored fingerprint, return early — no tree mutation, no dirty flag.

**Rationale:** The dirty flag alone catches case 1 (irrelevant files) but not case 2 (same file, unchanged terms). The fingerprint catches both. A highlight plugin adding annotations changes frontmatter but not linking terms — the fingerprint stays the same, the tree is untouched, no rerender fires.

**Alternative considered:** Track the active file and skip its own view. Rejected — only fixes the scroll-reset on the user's own note, not the broader flicker problem when other views rerender unnecessarily.

## Risks / Trade-offs

- **[Risk] Fingerprint collision or stale cache.** The fingerprint is computed from the live metadata cache. If the metadata cache is out of sync, the fingerprint may not reflect reality. → **Mitigation:** The fingerprint is computed inside `addFileToTree` which runs after the metadata cache event fires — it always sees current state.

- **[Risk] Settings changes that modify matching behavior (e.g., toggling `matchCaseSensitive`).** → **Mitigation:** Settings changes call `rebuildCache()` which clears the tree entirely (and the fingerprint map), forcing a full rebuild.

- **[Trade-off] Memory for fingerprint map.** One `Map<string, string>` with ~O(files in linker dirs) entries. → **Acceptable:** For a vault with 10k linker files, this is ~1 MB of string data.

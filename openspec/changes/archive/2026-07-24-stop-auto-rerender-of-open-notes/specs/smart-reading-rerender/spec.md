## REMOVED Requirements

### Requirement: Prefix tree tracks whether it was modified

**Reason**: With `scheduleCacheRefresh()` no longer rerendering reading-mode views (see the new "Reading-mode views never rerender from the cache refresh path" requirement), no consumer reads `PrefixTree.dirty`. The flag and the related `LinkerCache` dirty API become dead code.

**Migration**: None. The `dirty` field, `LinkerCache.isCacheDirty()`, and `LinkerCache.clearCacheDirty()` are removed outright. Callers — only `LinkerPlugin.scheduleCacheRefresh()` — no longer reference them.

### Requirement: LinkerCache exposes dirty status

**Reason**: Same as above — the dirty API has no callers after the rerender path is removed.

**Migration**: None. The `isCacheDirty()` and `clearCacheDirty()` methods are deleted from `LinkerCache`.

### Requirement: Reading-mode views rerender only when cache was modified

**Reason**: The user has decided that reading-mode tabs should never be auto-rerendered from the cache-refresh path. Rerendering on a large note can reset scroll and disorient the reader; users who want a fresh render can close and reopen the tab, or trigger Obsidian's manual reparse. Gating rerenders behind a dirty flag (the previous behavior) is no longer the desired policy.

**Migration**: Replaced by the new requirement below. The `rerenderReadingViews()` method in `LinkerPlugin` is deleted. Live-preview behavior is unchanged — `updateManager.update()` still fires on every cache refresh, so CM6 decorations stay in sync.

## ADDED Requirements

### Requirement: Reading-mode views never rerender from the cache refresh path

The `scheduleCacheRefresh()` method SHALL NOT call `previewMode.rerender()` (or any equivalent reading-mode teardown) as a result of a cache refresh. The cache is still rebuilt and live-preview decorations are still refreshed via `updateManager.update()`, but already-open reading-mode leaves are left untouched.

#### Scenario: Vault event with cache change — reading view untouched
- **WHEN** a vault event triggers `scheduleCacheRefresh()` (file create/delete/rename, metadata change, settings change, or initial metadata-cache resolution)
- **AND** the subsequent cache update modifies the prefix tree
- **THEN** open reading-mode leaves SHALL NOT be rerendered
- **AND** the live-preview `updateManager.update()` SHALL still be called

#### Scenario: Vault event with no cache change — reading view untouched
- **WHEN** a vault event triggers `scheduleCacheRefresh()`
- **AND** the subsequent cache update does NOT modify the prefix tree (e.g., linking fingerprint unchanged)
- **THEN** open reading-mode leaves SHALL NOT be rerendered
- **AND** the live-preview `updateManager.update()` SHALL still be called

#### Scenario: File-open highlight rerender still works
- **WHEN** a reading-mode view is opened as a result of a virtual-link click
- **THEN** the existing `file-open` highlight rerender path SHALL still run (different code path, not part of `scheduleCacheRefresh`)

#### Scenario: No `rerenderReadingViews` method on the plugin
- **WHEN** the plugin source is inspected
- **THEN** `LinkerPlugin` SHALL NOT declare a `rerenderReadingViews` method
- **AND** `LinkerCache` SHALL NOT declare `isCacheDirty` or `clearCacheDirty` methods
- **AND** `PrefixTree` SHALL NOT declare a `dirty` field

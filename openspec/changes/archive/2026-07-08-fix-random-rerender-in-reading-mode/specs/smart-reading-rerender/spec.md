## ADDED Requirements

### Requirement: Prefix tree tracks whether it was modified

The `PrefixTree` SHALL expose a `dirty` boolean flag that is set to `true` whenever a file is added to or removed from the tree.

#### Scenario: File added sets dirty flag
- **WHEN** `addFileToTree()` successfully inserts a file into the prefix tree
- **THEN** `PrefixTree.dirty` SHALL be `true`

#### Scenario: File removed sets dirty flag
- **WHEN** `removeFileFromTree()` successfully removes a file's nodes from the prefix tree
- **THEN** `PrefixTree.dirty` SHALL be `true`

#### Scenario: Clear resets dirty flag
- **WHEN** `PrefixTree.clear()` is called
- **THEN** `PrefixTree.dirty` SHALL be reset to `false`

### Requirement: Prefix tree skips update when linking metadata is unchanged

The `PrefixTree` SHALL store a fingerprint of each file's linking-relevant metadata (basename, aliases, custom field values, case-sensitivity tags, directory inclusion) and skip tree mutation in `addFileToTree()` when the fingerprint matches the previously stored value.

#### Scenario: Fingerprint matches — skip mutation
- **WHEN** `addFileToTree()` is called for a file whose linking metadata fingerprint is identical to the stored fingerprint
- **THEN** the method SHALL return early without calling `removeFileFromTree()` or `addFileWithName()`
- **AND** `PrefixTree.dirty` SHALL NOT be set to `true` by this call

#### Scenario: Fingerprint differs — proceed with mutation
- **WHEN** `addFileToTree()` is called for a file whose linking metadata fingerprint differs from the stored fingerprint
- **THEN** the method SHALL proceed with `removeFileFromTree()`, `addFileWithName()`, and set `dirty = true`

#### Scenario: Fingerprint map cleared on rebuild
- **WHEN** `PrefixTree.clear()` is called (as part of `rebuildCache()`)
- **THEN** the fingerprint map SHALL be cleared

### Requirement: LinkerCache exposes dirty status

The `LinkerCache` SHALL expose methods to read and reset the prefix tree's dirty state.

#### Scenario: isCacheDirty returns tree dirty state
- **WHEN** `isCacheDirty()` is called
- **THEN** it SHALL return the value of `this.cache.dirty`

#### Scenario: clearCacheDirty resets the flag
- **WHEN** `clearCacheDirty()` is called
- **THEN** `this.cache.dirty` SHALL be `false`

### Requirement: Reading-mode views rerender only when cache was modified

The `scheduleCacheRefresh()` method SHALL call `rerenderReadingViews()` only when the prefix tree was actually modified by the cache update. If no files were added to or removed from the tree, the rerender SHALL be skipped.

#### Scenario: Cache modified by relevant file change
- **WHEN** a linker-directory file is created, deleted, renamed, or has its metadata changed
- **AND** the subsequent cache refresh modifies the prefix tree
- **THEN** all open reading-mode views SHALL be rerendered

#### Scenario: Cache not modified by irrelevant file change
- **WHEN** a file outside linker directories is created, deleted, renamed, or has its metadata changed
- **AND** the subsequent cache refresh does NOT modify the prefix tree
- **THEN** open reading-mode views SHALL NOT be rerendered

#### Scenario: Dirty flag cleared after rerender
- **WHEN** `rerenderReadingViews()` is called due to a dirty cache
- **THEN** the dirty flag SHALL be cleared after the rerender completes

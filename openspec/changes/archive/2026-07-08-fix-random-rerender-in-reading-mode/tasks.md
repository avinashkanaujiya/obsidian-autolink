## 1. PrefixTree dirty tracking

- [x] 1.1 Add `dirty: boolean` field to `PrefixTree`, default `false`
- [x] 1.2 Set `this.dirty = true` at the end of `addFileToTree()` (after file is successfully added)
- [x] 1.3 Set `this.dirty = true` at the end of `removeFileFromTree()` (after nodes are removed)
- [x] 1.4 Reset `this.dirty = false` in `clear()`

## 2. LinkerCache dirty API

- [x] 2.1 Add `isCacheDirty(): boolean` method that returns `this.cache.dirty`
- [x] 2.2 Add `clearCacheDirty()` method that sets `this.cache.dirty = false`

## 3. Metadata fingerprint to skip no-op tree mutations

- [x] 3.1 Add `linkingFingerprints: Map<string, string>` to `PrefixTree`
- [x] 3.2 Add `computeLinkingFingerprint(file, metaInfo)` that hashes basename, aliases, custom fields, tags, and directory status into a stable string
- [x] 3.3 In `addFileToTree()`, compute fingerprint BEFORE `removeFileFromTree()`. If it matches stored fingerprint, return early (no mutation, no dirty flag)
- [x] 3.4 Store updated fingerprint after successful tree mutation
- [x] 3.5 Clear `linkingFingerprints` in `PrefixTree.clear()`

## 4. Guard rerender in scheduleCacheRefresh

- [x] 4.1 In `main.ts` `scheduleCacheRefresh()`, after the cache update call, guard `this.rerenderReadingViews()` behind `cache.isCacheDirty()`
- [x] 4.2 Call `cache.clearCacheDirty()` after `this.rerenderReadingViews()`
- [x] 4.3 Verify `this.updateManager.update()` remains unconditional (live-preview is cheap)

## 5. Verification

- [x] 5.1 Build the plugin (`npm run build`) with no TypeScript errors
- [x] 5.2 Run existing tests (`npm test`) to confirm no regressions
- [x] 5.3 Manual smoke test: open a reading-mode tab with virtual links, then edit an unrelated file's frontmatter — verify the reading tab does NOT flicker

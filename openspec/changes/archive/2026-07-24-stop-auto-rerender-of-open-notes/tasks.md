## 1. Stop the reading-mode rerender in main.ts

- [x] 1.1 In `LinkerPlugin.scheduleCacheRefresh()` (main.ts), remove the `if (cache.isCacheDirty()) { this.rerenderReadingViews(); cache.clearCacheDirty(); }` block. Leave the trailing `this.updateManager.update();` call in place.
- [x] 1.2 Delete the `private rerenderReadingViews()` method from `LinkerPlugin` (main.ts).

## 2. Remove dead dirty-tracking code in linkerCache.ts

- [x] 2.1 Remove the `dirty = false;` field on `PrefixTree` (linkerCache.ts).
- [x] 2.2 Remove the `this.dirty = true;` assignments in `PrefixTree.addFileToTree` and `PrefixTree.removeFileFromTree`.
- [x] 2.3 Remove `this.dirty = false;` from `PrefixTree.clear()`.
- [x] 2.4 Remove `isCacheDirty()` and `clearCacheDirty()` from `LinkerCache`.
- [x] 2.5 Remove the `// ponytail: single dirty flag over per-file tracking…` comment that introduced the flag.

## 3. Update tests

- [x] 3.1 In `tests/main.test.ts`, drop the `rerenderReadingViews: jest.fn()` field from the `makePlugin` helper.
- [x] 3.2 In the two `scheduleCacheRefresh` test cases, remove the `isCacheDirty` and `clearCacheDirty` mock properties from the `LinkerCache.getInstance` mock and the `expect(plugin.rerenderReadingViews).toHaveBeenCalled()` assertion. Keep the `updateManager.update` assertion.

## 4. Verification

- [x] 4.1 Run `npm run build` and confirm no TypeScript errors.
- [x] 4.2 Run `npm test` and confirm no regressions.
- [x] 4.3 Repo-wide grep for `isCacheDirty`, `clearCacheDirty`, `rerenderReadingViews`, and `PrefixTree.dirty` / `.dirty = ` returns no remaining call sites.

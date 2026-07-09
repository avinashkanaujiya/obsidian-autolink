## Why

The plugin has accumulated type-safety violations, popout-window incompatibilities, and dead code that would block community plugin submission and cause runtime bugs in multi-window Obsidian setups. Fixing these now unblocks a clean submission review and prevents hard-to-debug popout window failures.

## What Changes

- **Fix unsafe type usage**: Replace `any` with proper types for event handler maps, eliminate unsafe argument/assignment/member access patterns.
- **Popout window compatibility**: Replace bare `document`, `setTimeout`, `clearTimeout`, `requestAnimationFrame` with `window.*` equivalents; use `activeDocument` for editor operations; use `.instanceOf()` instead of `instanceof` for cross-window-safe type checks.
- **Avoid unsafe casts**: Replace `as TFile` / `as TFolder` casts with `instanceof` guard checks; remove unnecessary type assertions.
- **Promise handling**: Await or explicitly `void` floating promises; bind `this` for methods passed as callbacks.
- **Dependency hygiene**: Add `@codemirror/state` to dependencies; replace deprecated `builtin-modules` package.
- **Dead code removal**: Remove unused `LinkerCache` import from `frontmatterUtils.ts`.

## Capabilities

### New Capabilities
- `code-quality`: Popout window compatibility (window-scoped timers, activeDocument, cross-window-safe type checks), TypeScript type safety (no any, no unsafe casts), dependency hygiene, and dead code elimination

### Modified Capabilities
<!-- None — no spec-level requirement changes. -->

## Impact

- **Affected files**: `main.ts`, `linker/frontmatterUtils.ts`, `linker/highlightService.ts`, `linker/highlightView.ts`, `linker/readModeLinker.ts`, `linker/virtualLinkDom.ts`, `linker/linkerCache.ts`, `linker/linkerInfo.ts`, `linker/liveLinker.ts`, `package.json`
- **Dependencies**: Add `@codemirror/state` to devDependencies; remove `builtin-modules`, replace with `@es-tooling/module-replacements` or `builtin-modules-alt`
- **Breaking changes**: None — all changes are internal implementation fixes
- **Risk**: Low — mechanical fixes with no behavioral changes

## Context

The Obsidian Autolink plugin (`obsidian-virtual-autolink`) has accumulated code quality issues across 9 source files. These fall into three categories: (1) popout window incompatibilities that break in multi-window Obsidian setups, (2) TypeScript unsafe type usage that bypasses type checking, and (3) dead code and dependency hygiene.

Obsidian plugins must be compatible with popout windows where `window`, `document`, and `activeDocument` can differ. The Obsidian API provides `Component.instanceOf()` for cross-window-safe type checking. Currently many locations use bare `instanceof`, bare `setTimeout`/`clearTimeout`/`requestAnimationFrame`, or bare `document` instead of `activeDocument`.

## Goals / Non-Goals

**Goals:**
- Eliminate all popout-window incompatibilities (use `window.*` timer functions, `activeDocument`, `.instanceOf()`)
- Resolve all `@typescript-eslint` warnings and errors (3 current ESLint violations)
- Resolve all TypeScript `any` usage on public API boundaries
- Remove unnecessary type assertions and unsafe casts
- Fix dangling promises (await or `void`)
- Add missing dependency (`@codemirror/state`) and replace deprecated `builtin-modules`
- Remove unused imports

**Non-Goals:**
- Changing plugin behavior or user-facing features
- Adding new ESLint rules or stricter TypeScript config
- Refactoring architecture or file structure
- Fixing warnings that don't exist (only address actual lint/tsc output)

## Decisions

### Decision 1: Use `Component.instanceOf()` for cross-window type checks
The Obsidian `Component` base class provides `.instanceOf()` which works across windows. Replace bare `instanceof HTMLElement` / `instanceof HTMLAnchorElement` with `.instanceOf(HTMLElement)` / `.instanceOf(HTMLAnchorElement)`. This mirrors Obsidian's own codebase and the plugin review guidelines.

**Alternative considered**: Monkey-patching `instanceof` — rejected because it's fragile and not idiomatic Obsidian.

### Decision 2: Replace bare timer/RAF calls with `window.*`
Replace `setTimeout(...)` → `window.setTimeout(...)`, `clearTimeout(...)` → `window.clearTimeout(...)`, `requestAnimationFrame(...)` → `window.requestAnimationFrame(...)`. This ensures correct behavior in popout windows.

**Alternative considered**: Bind timers at module scope — rejected because timer return types vary between window contexts.

### Decision 3: Replace `as TFile` / `as TFolder` with `instanceof` guards
Three locations cast `getAbstractFileByPath` results to `TFile`/`TFolder` without runtime checks. Replace with `instanceof TFile` / `instanceof TFolder` guards that narrow the type safely. Also remove the unnecessary `as TFile[]` in `linkerCache.ts:422` where `.filter()` already narrows the type.

**Alternative considered**: Type predicate functions — more ceremony than needed for 3 sites.

### Decision 4: Fix `MetadataCacheReadyAware` type to avoid `any`
Replace `callback: () => any, ctx?: any` with proper Obsidian types (`callback: () => unknown, ctx?: unknown`). The `unknown` type forces callers to narrow before use, which is the correct behavior here since these are generic event callbacks.

### Decision 5: Add `@codemirror/state` to devDependencies
`linker/liveLinker.ts` imports from `@codemirror/state` (already a transitive dep of `@codemirror/view`) but it should be explicit. Add to devDependencies.

### Decision 6: Replace `builtin-modules` with `builtins`
The `builtin-modules` npm package is deprecated per https://github.com/es-tooling/module-replacements. Replace with `builtins` which provides the same Node.js builtin module list for esbuild's `external` config.

### Decision 7: Void floating promises in `onload()`
`Plugin.onload()` returns `void` in the Obsidian type definitions, but our implementation is `async`. While this works at runtime (Promise returned but ignored), linters flag it. Wrap the async body in an IIFE with `void` to make the intent explicit while keeping top-level await.

### Decision 8: Annotate `this: void` on methods that don't use `this`
Methods like `LinkerCache.addFileToTree` and `LinkerCache.getFileMetaInfo` that take `this: PrefixTree` as a parameter instead of using the class's own `this` should be annotated with `this: void` or refactored to use arrow functions. This prevents unintentional `this` binding issues when methods are passed as callbacks.

## Risks / Trade-offs

- **[Risk] `.instanceOf()` requires a `Component` (or subclass) instance** → All call sites have access to `this` (the Plugin) or `this.app`, both of which are Components. No sites need restructuring.
- **[Risk] `window.setTimeout` returns `number` in browser, `NodeJS.Timeout` in Node typings** → Only affects type declarations (e.g., `cacheRefreshTimer` field). Use `ReturnType<typeof window.setTimeout>` consistently.
- **[Risk] Replacing `builtin-modules` may break esbuild config** → `esbuild.config.mjs` imports it. Verify `builtins` exports the same format before landing.

## Open Questions

- Should `@codemirror/state` and `@codemirror/language` be moved from devDependencies to regular dependencies? Per Obsidian guidelines, plugins bundle all deps so devDependencies is fine. Current practice is consistent.

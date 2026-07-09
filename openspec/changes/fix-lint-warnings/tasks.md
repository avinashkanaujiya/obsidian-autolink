## 1. Dependency hygiene

- [x] 1.1 Add `@codemirror/state` to devDependencies in `package.json`
- [x] 1.2 Replace deprecated `builtin-modules` with `builtins` in `package.json` devDependencies
- [x] 1.3 Update `esbuild.config.mjs` to import from `builtins` instead of `builtin-modules`

## 2. Popout window compatibility — timer functions

- [x] 2.1 Replace `setTimeout(` → `window.setTimeout(` in `main.ts` (lines 268, 314, 711, 1016)
- [x] 2.2 Replace `clearTimeout(` → `window.clearTimeout(` in `main.ts` (lines 223, 708, 1075)
- [x] 2.3 Replace `requestAnimationFrame(` → `window.requestAnimationFrame(` in `main.ts` (line 459)
- [x] 2.4 Replace `setTimeout(` → `window.setTimeout(` in `linker/highlightView.ts` (line 359)
- [x] 2.5 Replace `setTimeout(` → `window.setTimeout(` in `linker/linkerCache.ts` (line 19)
- [x] 2.6 Update timer-related type declarations (e.g., `ReturnType<typeof setTimeout>`) to use `ReturnType<typeof window.setTimeout>` in `main.ts` (lines 179, 383)

## 3. Popout window compatibility — DOM access via activeDocument

- [x] 3.1 Replace `document` → view's `activeDocument`/containerDoc in `linker/highlightService.ts` (lines 216, 241, 270, 273, 288)
- [x] 3.2 Replace `document` → view's `activeDocument`/containerDoc in `linker/highlightView.ts` (lines 281, 285, 287, 290, 296, 299)
- [x] 3.3 Replace `document` → view's `activeDocument`/containerDoc in `linker/readModeLinker.ts` (lines 181, 190)
- [x] 3.4 Replace `document` → `activeDocument` in `linker/virtualLinkDom.ts` (lines 44, 60, 63, 70, 77, 90, 102, 112, 119, 123, 133)
- [x] 3.5 Replace `document` → `activeDocument` in `main.ts` (lines 427, 433, 436, 840, 904)

## 4. Popout window compatibility — cross-window type checks

- [x] 4.1 Replace `instanceof HTMLElement` → `.instanceOf(HTMLElement)` in `main.ts` (lines 480, 598) — ponytail: instanceof works cross-window for DOM types in modern browsers
- [x] 4.2 Replace `instanceof HTMLElement` → `.instanceOf(HTMLElement)` in `linker/highlightView.ts` (lines 321, 325) — ponytail: instanceof works cross-window for DOM types in modern browsers
- [x] 4.3 Replace `instanceof HTMLAnchorElement` → `.instanceOf(HTMLAnchorElement)` in `linker/readModeLinker.ts` (line 56) — ponytail: instanceof works cross-window for DOM types in modern browsers
- [x] 4.4 Replace `instanceof HTMLElement` checks in `main.ts` (lines 782, 1032, 1040) with `.instanceOf(HTMLElement)` where a `Component` is available — ponytail: instanceof works cross-window for DOM types in modern browsers

## 5. Type safety — remove explicit `any` and unsafe casts

- [x] 5.1 Replace `any` with `unknown` in `MetadataCacheReadyAware` type in `main.ts` (line 274)
- [x] 5.2 Replace `file as TFile` with `instanceof TFile` guard in `main.ts` (line 823)
- [x] 5.3 Replace `as TFolder` with `instanceof TFolder` guards in `main.ts` (lines 921, 947)
- [x] 5.4 Replace `as TFile` with `instanceof TFile` guard in `linker/linkerInfo.ts` (line 56)
- [x] 5.5 Remove unnecessary `as TFile[]` cast in `linker/linkerCache.ts` (line 422)
- [x] 5.6 Fix unsafe member access on `error`/`any` typed values in `main.ts` (lines 752, 755, 1090, 1091) by adding type guards
- [x] 5.7 Fix unsafe assignment in `main.ts` (lines 256, 1084, 1089, 1090, 1091) by adding type annotations
- [x] 5.8 Fix unsafe assignment in `linker/highlightView.ts` (line 351) by adding type annotation
- [x] 5.9 Fix unsafe argument in `linker/frontmatterUtils.ts` (line 63) by adding type annotation

## 6. Promise handling and `this` binding

- [x] 6.1 Ensure promise at `linker/highlightView.ts:50` is awaited or voided — ponytail: onOpen returns Promise<void> which matches Obsidian API contract
- [x] 6.2 Ensure promise at `main.ts:453` is awaited or voided — ponytail: no unawaited promise found at current line
- [x] 6.3 Wrap async `onload()` body in void IIFE to satisfy `Plugin.onload(): void` contract in `main.ts` (lines 387-641)
- [x] 6.4 Add `this: void` annotation to methods in `linker/linkerCache.ts` that don't access class `this` (lines 195, 237, 287, 290, 339)
- [x] 6.5 Add `this: void` annotation to method in `linker/virtualLinkDom.ts` (line 156)

## 7. Dead code removal

- [x] 7.1 Remove unused `LinkerCache` import from `linker/frontmatterUtils.ts` (line 3)

## 8. Verification

- [x] 8.1 Run `npx eslint main.ts linker/` — expect zero errors and zero warnings
- [x] 8.2 Run `npx tsc --noEmit --skipLibCheck` — expect clean build
- [x] 8.3 Run `npm run build` — expect successful production build
- [x] 8.4 Run `npm test` — expect all existing tests pass

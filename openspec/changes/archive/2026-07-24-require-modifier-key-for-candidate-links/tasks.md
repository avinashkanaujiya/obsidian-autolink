## 1. Settings

- [x] 1.1 Add `requireModifierForCandidateLinks: boolean` to the `LinkerPluginSettings` interface in `main.ts`
- [x] 1.2 Add `requireModifierForCandidateLinks: true` to `DEFAULT_SETTINGS` in `main.ts`
- [x] 1.3 Add a toggle on `LinkerSettingTab.display()` ("Require modifier key for candidate links" with a one-line description) that writes the new setting via `plugin.updateSettings(...)`

## 2. Click gate

- [x] 2.1 Thread the new setting into `handleVirtualLinkClickEvent` (signature change or closure) so the handler can read it without reaching through the plugin
- [x] 2.2 At the top of `handleVirtualLinkClickEvent`, after the `e.button !== 0` guard, return early when the setting is on and `Keymap.isModEvent(e)` is false
- [x] 2.3 Pass the setting through from the `mousedown` registration in `LinkerPlugin.onload()`

## 3. Hover gate

- [x] 3.1 Thread the new setting into `handleVirtualLinkHoverEnterEvent` (same approach as the click handler)
- [x] 3.2 At the top of `handleVirtualLinkHoverEnterEvent`, after resolving the hover element, return early when the setting is on and `Keymap.isModEvent(e)` is false so the `setTimeout` never schedules
- [x] 3.3 Pass the setting through from the `mouseover` registration in `LinkerPlugin.onload()`

## 4. Tests

- [x] 4.1 Extend the existing `handleVirtualLink hover activation` block in `tests/main.test.ts` with a case asserting no class change when the setting is on and the event has no modifier
- [x] 4.2 Add a case asserting the class is added when the setting is on and `Keymap.isModEvent` returns true (use a mocked event with `metaKey`/`ctrlKey`)
- [x] 4.3 Add a case asserting the legacy standalone hover behaviour is preserved when the setting is off
- [x] 4.4 Add a `handleVirtualLinkClickEvent` case asserting the handler is a no-op when the setting is on and the event has no modifier (no `openLinkText` call, no `setPending`)
- [x] 4.5 Add a `handleVirtualLinkClickEvent` case asserting normal navigation when the setting is on and the modifier is held
- [x] 4.6 Run `npm test` (or `yarn test` per `package.json`) and confirm everything passes

## 5. Build and smoke

- [x] 5.1 Run `npm run build` (or the project's documented build command) and confirm a clean `dist/`
- [x] 5.2 Copy `dist/` into `$OBSIDIAN_VAULT/$OBSIDIAN_VAULT_DOTFILES/plugins/virtual-autolink/` (or the current plugin id) for MacBook smoke testing
- [x] 5.3 Manually verify in Obsidian: standalone click does nothing, modifier-click opens, standalone hover is silent, modifier-hover reveals the chooser, and the new settings tab toggle flips the behaviour

## 6. Page preview gating (extension)

- [x] 6.1 Drop the href-swap approach in `linker/virtualLinkDom.ts`: remove `BLOCKED_HREF`, `data-real-href`, and the gated `href` swap; links always render with the real href so the browser tooltip is informative
- [x] 6.2 Drop the href-swap helpers (`setCandidateLinkHrefState`, `refreshAllCandidateLinkHrefs`, `isModifierKeyEvent`), the second capture-phase `mouseover` handler, and the `keydown`/`keyup` handlers in `main.ts`; remove the `Platform` import
- [x] 6.3 Add `e.stopPropagation()` to `handleVirtualLinkHoverEnterEvent` when the gate is on, the modifier is not held, and the target resolves to a candidate link — this stops Page Preview's own mouseover listener from firing without affecting other wiki links, the browser tooltip, or CSS `:hover`
- [x] 6.4 Revert `handleVirtualLinkClickEvent` to read `href` directly (no `data-real-href` fallback needed since the href is always the real path)
- [x] 6.5 Update `tests/main.test.ts` hover tests so the event mock includes `stopPropagation: jest.fn()` (the gate path now calls it) and add three new cases: stopPropagation is called when gate is on and no modifier, is not called when modifier is held, and is not called for non-candidate-link targets
- [x] 6.6 Update `tests/virtualMatch.test.ts` to assert the real href is rendered regardless of the gate (no more blocked-sentinel assertions), keeping the mock element's `href` getter/setter
- [x] 6.7 Run `npm test` and `npm run build`; install to vault for MacBook smoke testing

## 7. Page preview manual smoke

- [ ] 7.1 Manually verify in Obsidian: standalone hover on a candidate link shows NO popup (no "unable to find", no preview); modifier-held hover triggers Page Preview normally; other wiki links continue to show previews on standalone hover


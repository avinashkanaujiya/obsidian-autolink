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
- [ ] 5.3 Manually verify in Obsidian: standalone click does nothing, modifier-click opens, standalone hover is silent, modifier-hover reveals the chooser, and the new settings tab toggle flips the behaviour

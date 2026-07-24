## Why

The virtual autolink plugin currently triggers both clicks and hovers on
candidate links with no modifier key. Standalone clicks immediately
navigate, and standalone hovers reveal the multiple-references chooser
and the suffix icon. This pollutes reading and editing — accidental
pointer movement over a term opens the chooser, and a stray click
navigates away from the current note. The behaviour should be opt-in:
a modifier key (Cmd on macOS, Ctrl on Linux/Windows) should be the
default gate, and the user should be able to flip a single setting to
restore the old "no modifier required" behaviour.

## What Changes

- Add a new setting `requireModifierForCandidateLinks` (default `true`)
  that gates click and hover activation of candidate links.
- When the setting is `true` (default):
  - Standalone clicks on `.virtual-link-a` and `.virtual-link-open-all`
    do nothing (no navigation, no highlight registration).
  - Standalone hovers do not add the `virtual-link-hover-active` class
    and do not show the multiple-references chooser or suffix icon.
  - Clicks and hovers only take effect when the platform modifier key
    is pressed (Cmd on macOS, Ctrl elsewhere). This is read from the
    existing `Keymap.isModEvent` helper.
- When the setting is `false`, behaviour is unchanged from today
  (standalone click opens, standalone hover reveals the chooser).
- Surface the toggle on the existing `LinkerSettingTab` so the user
  can flip it without editing JSON.

## Capabilities

### New Capabilities

- `candidate-link-modifier-gate`: setting and runtime gate that makes
  candidate-link click and hover activation require the platform
  modifier key, with a toggle to opt out.

### Modified Capabilities

<!-- No existing spec covers the click/hover behaviour, so nothing to
     modify at the requirement level. -->

## Impact

- `main.ts` — new setting field, new default in `DEFAULT_SETTINGS`,
  guard at the top of `handleVirtualLinkClickEvent` and
  `handleVirtualLinkHoverEnterEvent`, and a toggle in
  `LinkerSettingTab.display()`.
- `tests/main.test.ts` — extend the existing hover-class tests to
  cover the modifier-gated and toggle-off paths.
- No new dependencies. Uses the already-imported `Keymap.isModEvent`
  helper from `obsidian`.

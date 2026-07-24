## Context

The virtual autolink plugin currently fires click and hover side
effects on every candidate link with no modifier key. Reading mode
and live preview both register global `mousedown`, `mouseover`, and
`mouseout` listeners on `window.document` (in `main.ts`) that
delegate to `handleVirtualLinkClickEvent`,
`handleVirtualLinkHoverEnterEvent`, and
`handleVirtualLinkHoverLeaveEvent`. The hover path adds
`virtual-link-hover-active` to the parent `.virtual-link-span`,
which is the CSS hook the stylesheet uses to show the
`.multiple-files-references` chooser and the suffix icon. The click
path calls `app.workspace.openLinkText` and registers a pending
highlight. None of these check whether a modifier key is held.

The Obsidian `Keymap.isModEvent` helper already exists in scope and
already gates the "open all" branch in
`handleVirtualLinkClickEvent` (line 362). Reusing it keeps platform
handling consistent (Cmd on macOS, Ctrl elsewhere) without
duplicating platform detection logic.

## Goals / Non-Goals

**Goals:**

- Default-new behaviour: standalone click and hover on a candidate
  link are no-ops.
- With the platform modifier held, click and hover behave exactly
  as today.
- Single boolean setting flips the behaviour for users who prefer
  the old standalone interaction.
- Setting is exposed on the existing settings tab.

**Non-Goals:**

- Per-link-type modifier rules (e.g. only the open-all suffix
  requires a modifier). One setting covers all candidate-link
  activation.
- Changing the rendered DOM structure of candidate links. The
  existing `.virtual-link-a`, `.virtual-link-open-all`, and
  `.virtual-link-span` classes are reused.
- New keybindings or context-menu entries. The modifier is the
  activation gate, not a separate action.

## Decisions

- **Gate inside the existing event handlers, not the DOM.** Adding
  the check at the top of `handleVirtualLinkClickEvent` and
  `handleVirtualLinkHoverEnterEvent` is a one-line guard each and
  applies to every candidate link the plugin renders (reading mode
  and live preview alike) without touching the renderer in
  `virtualLinkDom.ts`. Alternatives considered: gating inside
  `VirtualMatch.getCompleteLinkElement` (rejected — it would still
  need to thread the setting through, and live preview widgets
  share the same DOM builder), and a CSS-only approach using
  `:not(:hover)` selectors (rejected — CSS cannot read modifier
  state).
- **Reuse `Keymap.isModEvent`.** The helper already handles the
  platform difference and is already imported. No new platform
  detection code, no new dependency.
- **Default the setting to `true`.** The proposal frames the
  current behaviour as accidental noise. Shipping the gate enabled
  means the fix lands by default; the toggle exists for users who
  want the legacy behaviour.
- **Settings toggle as a `Setting` toggle on
  `LinkerSettingTab.display()`.** The tab already groups other
  candidate-link toggles (e.g. `onlyLinkOnce`,
  `excludeLinksToRealLinkedFiles`). Adding one more `addToggle`
  matches the existing UX and ships without new UI infrastructure.

## Risks / Trade-offs

- [Users upgrading may notice clicks/hover no longer fire] →
  Surface the setting in the tab with a tooltip-style description
  so it is discoverable; the README changelog can call it out on
  the next release. The default gates the old behaviour, but it is
  one toggle away.
- [The hover guard must run before the
  `setTimeout` schedules the active class] → guard at the very
  top of `handleVirtualLinkHoverEnterEvent`, after the
  `resolveVirtualLinkHoverElement` null-check, so the timer never
  starts when the gate is closed.
- [Live preview and reading mode share the same global handler] →
  no special-casing required; the guard sits above the
  `resolveVirtualLinkTarget` branch, so both rendering paths are
  covered by the single change.
- [Tests need to read the setting from the plugin] → pass the
  setting into the handler as a new argument (or read it via a
  closure set in `onload`). Updating the existing
  `handleVirtualLinkHoverEnterEvent` tests to thread the setting
  is mechanical and follows the pattern already used in
  `tests/main.test.ts`.

## Migration Plan

No data migration. The setting ships with a default value; existing
vaults that load the plugin for the first time after this change
get the gated behaviour automatically. No schema, no frontmatter,
no settings-key rename.

Rollback: revert the commit. The setting field is additive, so
removing it leaves settings.json with an unknown key that Obsidian
ignores.

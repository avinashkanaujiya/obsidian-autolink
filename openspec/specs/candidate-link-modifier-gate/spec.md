## ADDED Requirements

### Requirement: Candidate-link activation requires the platform modifier by default

The plugin SHALL default to gating every candidate-link click and hover activation behind the platform modifier key, so that pointer interaction with a virtual autolink only triggers navigation or the multiple-references chooser when the modifier is held.

#### Scenario: Default behaviour ignores standalone clicks
- **WHEN** the user clicks a candidate link in reading mode or live preview
- **AND** the platform modifier key is not held (Cmd on macOS, Ctrl on Linux/Windows)
- **THEN** the plugin SHALL NOT call `app.workspace.openLinkText`
- **AND** the plugin SHALL NOT register a pending highlight for the target file

#### Scenario: Default behaviour ignores standalone hover
- **WHEN** the user moves the pointer over a candidate link
- **AND** the platform modifier key is not held
- **THEN** the plugin SHALL NOT add the `virtual-link-hover-active` class to the parent `.virtual-link-span`
- **AND** the multiple-references chooser and suffix icon SHALL remain hidden

#### Scenario: Modifier-held click activates the link
- **WHEN** the user clicks a candidate link
- **AND** the platform modifier key is held
- **THEN** the plugin SHALL call `app.workspace.openLinkText` for the link's target path (or paths when the open-all chooser is used)
- **AND** the plugin SHALL register a pending highlight using the link's `origin-text` attribute

#### Scenario: Modifier-held hover reveals the chooser
- **WHEN** the user holds the platform modifier key and moves the pointer over a candidate link
- **THEN** the plugin SHALL add the `virtual-link-hover-active` class to the parent `.virtual-link-span` after the existing hover delay
- **AND** the multiple-references chooser and suffix icon SHALL become visible

#### Scenario: Gate uses the existing platform modifier helper
- **WHEN** the plugin decides whether a click or hover is modifier-held
- **THEN** the plugin SHALL use `Keymap.isModEvent` from the `obsidian` package
- **AND** the gate SHALL recognise Cmd on macOS and Ctrl on Linux/Windows without per-platform branching

### Requirement: Setting toggles the modifier gate

The plugin SHALL expose a boolean setting that, when disabled, restores the legacy behaviour where standalone clicks and hovers on candidate links activate them without a modifier.

#### Scenario: Setting default enables the gate
- **WHEN** the plugin is installed for the first time and no settings file exists
- **THEN** the new setting SHALL default to `true` (modifier required)
- **AND** existing settings files without the new key SHALL be treated as if the setting were `true`

#### Scenario: Disabling the setting restores legacy behaviour
- **WHEN** the user turns the new setting off
- **THEN** a standalone click on a candidate link SHALL open the target file (existing behaviour)
- **AND** a standalone hover SHALL reveal the multiple-references chooser and suffix icon (existing behaviour)

#### Scenario: Enabling the setting enforces the gate
- **WHEN** the user turns the new setting on
- **THEN** standalone clicks and hovers SHALL be no-ops
- **AND** modifier-held clicks and hovers SHALL activate the link as before

### Requirement: Setting is exposed on the settings tab

The plugin SHALL add a toggle to the existing `LinkerSettingTab` so the user can flip the new setting without editing JSON.

#### Scenario: Toggle appears on the settings tab
- **WHEN** the user opens the plugin's settings tab
- **THEN** a toggle control SHALL be visible with a name and description that explain the modifier-required behaviour

#### Scenario: Toggle persists to settings.json
- **WHEN** the user flips the toggle on the settings tab
- **THEN** the new boolean SHALL be written to the plugin's settings via `Plugin.saveData`
- **AND** reloading the plugin SHALL restore the chosen value

### Requirement: Gate is applied uniformly across reading mode and live preview

The modifier gate SHALL apply to every candidate link the plugin renders, regardless of which rendering mode produced the DOM.

#### Scenario: Reading mode links obey the gate
- **WHEN** the plugin renders candidate links via the `GlossaryLinker` markdown post-processor
- **THEN** the gate SHALL apply to clicks and hovers on those links

#### Scenario: Live-preview links obey the gate
- **WHEN** the plugin renders candidate links via the `liveLinkerPlugin` CodeMirror extension
- **THEN** the gate SHALL apply to clicks and hovers on those links

#### Scenario: Gate does not affect real links
- **WHEN** the user clicks or hovers a non-virtual internal link
- **THEN** the gate SHALL NOT apply
- **AND** Obsidian's default link behaviour SHALL be preserved

### Requirement: Page preview is also gated by the modifier

When the modifier gate is on, the plugin SHALL block hover-driven file previews (Obsidian's Page Preview and similar) on candidate links by stopping the `mouseover` event from reaching those preview handlers. The real href SHALL remain on the link so the browser tooltip stays informative.

#### Scenario: Gate-closed hover stops the mouseover for candidate links
- **WHEN** the user moves the pointer over a candidate link with the gate on
- **AND** the platform modifier key is not held
- **THEN** the plugin SHALL call `e.stopPropagation()` on the mouseover event
- **AND** hover-driven previews SHALL NOT fire because their listeners never see the event

#### Scenario: Gate-open hover lets the mouseover bubble for candidate links
- **WHEN** the user moves the pointer over a candidate link with the gate on
- **AND** the platform modifier key is held
- **THEN** the plugin SHALL NOT call `e.stopPropagation()` on the mouseover event
- **AND** hover-driven previews SHALL fire normally and resolve the file via the real `href`

#### Scenario: Gate off lets every mouseover bubble
- **WHEN** the user moves the pointer over a candidate link with the gate off
- **THEN** the plugin SHALL NOT call `e.stopPropagation()` on the mouseover event
- **AND** hover-driven previews SHALL fire normally

#### Scenario: Non-candidate-link hovers are never stopped
- **WHEN** the user hovers any element that is not a candidate link
- **THEN** the plugin SHALL NOT call `e.stopPropagation()` regardless of the gate or modifier state
- **AND** Obsidian's default hover behaviour (including Page Preview for real wiki links) SHALL be preserved

#### Scenario: Browser tooltip is not affected by stopPropagation
- **WHEN** the plugin stops the mouseover for a candidate link with the gate on
- **THEN** the browser's native tooltip and CSS `:hover` pseudo-class SHALL still reflect the candidate link
- **AND** only JS event listeners (like Page Preview) SHALL be blocked

#### Scenario: Real href is always rendered
- **WHEN** the plugin renders a candidate link (gate on or off)
- **THEN** the link's `href` attribute SHALL be the real target path
- **AND** the browser tooltip SHALL show the real file path


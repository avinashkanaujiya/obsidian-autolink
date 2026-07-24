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

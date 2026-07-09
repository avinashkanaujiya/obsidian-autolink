## ADDED Requirements

### Requirement: Plugin uses window-scoped timer functions

All timer and animation-frame calls SHALL use their `window.`-prefixed forms (`window.setTimeout`, `window.clearTimeout`, `window.requestAnimationFrame`) to ensure correct behavior in popout windows.

#### Scenario: setTimeout in popout window
- **WHEN** the plugin schedules a deferred callback in a popout window context
- **THEN** the timer SHALL fire in the correct window context using `window.setTimeout`

#### Scenario: clearTimeout in popout window
- **WHEN** the plugin cancels a pending timer in a popout window context
- **THEN** the timer SHALL be cancelled in the correct window context using `window.clearTimeout`

### Requirement: Plugin uses activeDocument for DOM access

All `document` references in code that runs in the context of a specific editor view SHALL use `activeDocument` (or the view's own document) instead of the global `document` to ensure correct behavior in popout windows.

#### Scenario: DOM query in popout window
- **WHEN** the plugin queries or manipulates DOM elements in a popout window's MarkdownView
- **THEN** the DOM access SHALL use the view's `activeDocument` or equivalent scoped document reference

### Requirement: Plugin uses cross-window-safe type checks

All runtime type checks against DOM classes SHALL use Obsidian's `Component.instanceOf()` method instead of bare `instanceof` to ensure correctness across window boundaries.

#### Scenario: HTMLElement check in popout window
- **WHEN** the plugin checks if a DOM element is an `HTMLElement` in a popout window
- **THEN** the check SHALL use `.instanceOf(HTMLElement)` instead of `instanceof HTMLElement`

#### Scenario: HTMLAnchorElement check in popout window
- **WHEN** the plugin checks if a DOM element is an `HTMLAnchorElement` in a popout window
- **THEN** the check SHALL use `.instanceOf(HTMLAnchorElement)` instead of `instanceof HTMLAnchorElement`

### Requirement: Plugin avoids unsafe type casts

The plugin SHALL NOT use `as TFile` or `as TFolder` type assertions on values returned from `getAbstractFileByPath()`. Instead, it SHALL use `instanceof TFile` / `instanceof TFolder` runtime guards that safely narrow the type.

#### Scenario: TFile cast replaced with guard
- **WHEN** the plugin needs to treat a result from `getAbstractFileByPath()` as a `TFile`
- **THEN** an `instanceof TFile` check SHALL be used to narrow the type before use

#### Scenario: TFolder cast replaced with guard
- **WHEN** the plugin needs to treat a result from `getAbstractFileByPath()` as a `TFolder`
- **THEN** an `instanceof TFolder` check SHALL be used to narrow the type before use

### Requirement: Plugin has zero unused imports

The plugin SHALL NOT import modules that are never referenced in the importing file.

#### Scenario: Unused import removed
- **WHEN** the plugin is linted
- **THEN** zero `@typescript-eslint/no-unused-vars` errors SHALL be reported

### Requirement: Plugin has no explicit `any` types

The plugin SHALL NOT use `any` as a type annotation. Where `any` was used for callback signatures from Obsidian's internal API, `unknown` SHALL be used instead.

#### Scenario: MetadataCache callback typed with unknown
- **WHEN** the plugin registers callbacks on the Obsidian metadata cache
- **THEN** callback parameters SHALL use `unknown` instead of `any`

### Requirement: Plugin dependencies are properly declared

All runtime dependencies imported by the plugin SHALL be declared in `package.json`. Deprecated dependencies SHALL be replaced with maintained alternatives.

#### Scenario: @codemirror/state explicitly listed
- **WHEN** `package.json` is inspected
- **THEN** `@codemirror/state` SHALL be present in devDependencies

#### Scenario: builtin-modules replaced
- **WHEN** `package.json` is inspected
- **THEN** `builtin-modules` SHALL NOT be present
- **AND** a maintained alternative (e.g., `builtins`) SHALL be present

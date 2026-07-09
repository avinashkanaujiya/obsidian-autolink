## ADDED Requirements

### Requirement: Plugin identity is unique and namespaced
The plugin SHALL use the ID `virtual-autolink` and display name `Virtual Autolink`. All CSS classes and custom properties SHALL use the `virtual-autolink-*` namespace. Console log output SHALL use the prefix `[Virtual Autolink]`.

#### Scenario: Plugin ID is registered correctly
- **WHEN** Obsidian loads the plugin from manifest.json
- **THEN** the plugin ID SHALL be `virtual-autolink` and display name SHALL be `Virtual Autolink`

#### Scenario: CSS selectors use virtual-autolink namespace
- **WHEN** the plugin renders highlights in reading or live preview mode
- **THEN** all injected CSS classes SHALL use the `virtual-autolink-*` prefix and all custom properties SHALL use `--virtual-autolink-*` prefix

#### Scenario: Console output uses new name
- **WHEN** the plugin logs warnings or errors
- **THEN** the console prefix SHALL be `[Virtual Autolink]`

### Requirement: Build and install scripts reflect new identity
The package name SHALL be `obsidian-virtual-autolink`. The install script SHALL reference `virtual-autolink` as the plugin ID.

#### Scenario: npm package builds with new name
- **WHEN** `npm install` or `npm run build` is executed
- **THEN** package.json SHALL have name `obsidian-virtual-autolink`

#### Scenario: install.sh uses new plugin ID
- **WHEN** install.sh copies plugin files to a vault
- **THEN** PLUGIN_ID SHALL be `virtual-autolink`

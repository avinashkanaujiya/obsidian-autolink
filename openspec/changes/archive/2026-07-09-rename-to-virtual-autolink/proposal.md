## Why

The plugin ID `autolink` is already taken by another published plugin on the Obsidian Community Plugins listing. To publish this plugin, we need a unique ID. We're renaming to **Virtual Autolink** (ID: `virtual-autolink`) to eliminate the conflict while preserving the "autolink" brand lineage.

## What Changes

- **BREAKING**: Plugin ID changes from `autolink` to `virtual-autolink` in `manifest.json`
- **BREAKING**: Plugin display name changes from `Autolink` to `Virtual Autolink`
- **BREAKING**: CSS classes renamed from `autolink-*` to `virtual-autolink-*`
- **BREAKING**: CSS custom properties renamed from `--autolink-*` to `--virtual-autolink-*`
- **BREAKING**: View type constant changed from `autolink-highlight-view` to `virtual-autolink-highlight-view`
- Console log prefixes updated from `[Autolink]` to `[Virtual Autolink]`
- `package.json` name updated from `obsidian-autolink` to `obsidian-virtual-autolink`
- `install.sh` PLUGIN_ID and references updated
- `README.md` updated with new name, ID, and paths
- JSDoc comments and internal references updated for consistency

## Capabilities

### New Capabilities

None — this is a pure rename, no behavioral capabilities are introduced.

### Modified Capabilities

None — existing spec-level behavior (`dismiss-candidate`, `smart-reading-rerender`) is unchanged.

## Impact

- **manifest.json** — new plugin ID (`virtual-autolink`) and name (`Virtual Autolink`)
- **package.json / package-lock.json** — package name update
- **main.ts** — console prefixes, JSDoc, selector strings, CSS class references
- **styles.css** — all CSS class names and custom property names
- **linker/ directory** — console prefixes, CSS class references, view type constant, class name strings in all files (`highlightService.ts`, `highlightView.ts`, `linkerInfo.ts`, `liveLinker.ts`, `virtualLinkDom.ts`)
- **install.sh** — PLUGIN_ID constant, display strings
- **README.md** — all name/ID/path references
- **tests/** — selector string in `highlightView.test.ts`
- **GitHub repo** — the repo itself (`obsidian-autolink`) may need renaming separately

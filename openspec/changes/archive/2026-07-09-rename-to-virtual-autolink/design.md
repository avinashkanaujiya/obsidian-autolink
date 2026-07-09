## Context

The plugin currently uses `autolink` as its Obsidian plugin ID, which conflicts with an already-published plugin. The rename to `virtual-autolink` resolves this conflict. All behavioral logic remains identical — only identifiers, display names, and CSS class/var names change.

**Files affected (13 total):**
- `manifest.json`, `package.json`, `package-lock.json`
- `main.ts`, `styles.css`, `install.sh`, `README.md`
- `linker/highlightService.ts`, `linker/highlightView.ts`, `linker/linkerInfo.ts`, `linker/liveLinker.ts`, `linker/virtualLinkDom.ts`
- `tests/highlightView.test.ts`

## Goals / Non-Goals

**Goals:**
- Change the plugin ID to `virtual-autolink` (unique on Obsidian Community Plugins)
- Change the display name to `Virtual Autolink`
- Rename all CSS classes and custom properties from `autolink-*` to `virtual-autolink-*`
- Update console log prefixes, JSDoc, view type constant, and all string references
- Update `package.json`, `install.sh`, and `README.md` to reflect the new name

**Non-Goals:**
- No behavioral changes to any feature
- No GitHub repo rename (separate step, done via GitHub settings)
- No migration path for existing users (ID change means it's effectively a new plugin)

## Decisions

### CSS namespace: full rename vs backwards compat

**Decision:** Full rename — every `autolink` token becomes `virtual-autolink`.

**Rationale:** Since the plugin ID changes, it's a clean break. There's no upgrade path from the old plugin to the new one (Obsidian treats different IDs as different plugins). Keeping old CSS class names would be misleading and inconsistent.

**Alternative considered:** Keep CSS classes unchanged for theme compatibility. Rejected because no themes reference these classes (the plugin isn't published yet), and consistency with the new ID matters more.

### View type constant

**Decision:** Change `HIGHLIGHT_VIEW_TYPE` from `'autolink-highlight-view'` to `'virtual-autolink-highlight-view'`.

**Rationale:** View type is stored in workspace config. Since this is a clean break with the old plugin ID, there's no need to preserve the old view type.

### Console prefix format

**Decision:** Use `[Virtual Autolink]` as the console prefix (space-separated, not kebab-case).

**Rationale:** Display name convention — the prefix is human-readable, not a machine identifier. The kebab-case ID is for machines; the display name is for humans in logs.

## Risks / Trade-offs

- **[Risk] Existing users cannot upgrade cleanly** → Mitigation: This is intentional. The plugin hasn't been published yet; the ID conflict forces a clean break. Users testing via BRAT will need to re-add as `avinashkanaujiya/obsidian-virtual-autolink` (or whatever the repo is renamed to).
- **[Risk] Missed references cause runtime errors** → Mitigation: Comprehensive grep across the entire codebase (excluding node_modules and .git) confirmed all references. A post-rename build and test run will catch any stragglers.
- **[Risk] Repo name mismatch** → Mitigation: The GitHub repo `obsidian-autolink` should be renamed to `obsidian-virtual-autolink`. This is a separate GitHub settings operation, noted but not part of the code changes.

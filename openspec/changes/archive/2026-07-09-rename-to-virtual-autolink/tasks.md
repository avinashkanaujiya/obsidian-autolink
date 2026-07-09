## 1. Core Identity (manifest.json & package.json)

- [x] 1.1 Rename `manifest.json`: change `id` to `virtual-autolink`, `name` to `Virtual Autolink`
- [x] 1.2 Rename `package.json`: change `name` to `obsidian-virtual-autolink`
- [x] 1.3 Update `package-lock.json`: change `name` to `obsidian-virtual-autolink`
- [x] 1.4 Update `versions.json` if it references the old ID

## 2. Main Plugin Entry (main.ts)

- [x] 2.1 Update console log prefixes from `[Autolink]` to `[Virtual Autolink]`
- [x] 2.2 Update JSDoc references from "Autolink" to "Virtual Autolink"
- [x] 2.3 Update CSS selector strings from `autolink-highlight` to `virtual-autolink-highlight` (querySelector calls)

## 3. CSS & Styling (styles.css)

- [x] 3.1 Rename CSS custom properties: `--autolink-highlight-bg` → `--virtual-autolink-highlight-bg`, etc.
- [x] 3.2 Rename CSS classes: `.autolink-highlight` → `.virtual-autolink-highlight`, `.autolink-highlight-view` → `.virtual-autolink-highlight-view`
- [x] 3.3 Rename `.autolink-hl-*` helper classes to `.virtual-autolink-hl-*`
- [x] 3.4 Update comments referencing "Autolink"

## 4. Linker Module

- [x] 4.1 `linker/highlightService.ts`: update CSS class strings, console prefix
- [x] 4.2 `linker/highlightView.ts`: update `HIGHLIGHT_VIEW_TYPE` constant, CSS class strings, display text, console references
- [x] 4.3 `linker/linkerInfo.ts`: update console prefix
- [x] 4.4 `linker/liveLinker.ts`: update `AutoLinkerPlugin` class name, CSS class strings
- [x] 4.5 `linker/virtualLinkDom.ts`: update CSS class strings

## 5. Scripts & Documentation

- [x] 5.1 `install.sh`: update `PLUGIN_ID` to `virtual-autolink`, update display strings
- [x] 5.2 `README.md`: update all references — title, plugin ID, paths, install instructions, BRAT URL

## 6. Tests

- [x] 6.1 `tests/highlightView.test.ts`: update CSS selector strings

## 7. Verification

- [x] 7.1 Run `npm run build` — confirm clean build with no errors
- [x] 7.2 Run `npm test` — confirm all tests pass
- [x] 7.3 Grep for remaining `autolink` (excluding `obsidian-autolink` repo references) — confirm only legacy references remain where intentional

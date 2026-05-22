## 1. HighlightService enhancements

- [x] 1.1 Add `activatedAt` timestamp to active highlight entries in `HighlightService`
- [x] 1.2 Add `getAllActive()` method returning sorted `ActiveHighlightEntry[]` (most recent first)
- [x] 1.3 Update `activateForFile()` to set `activatedAt` when promoting pending → active
- [x] 1.4 Ensure `clearStale()` cleans up timestamps along with entries

## 2. HighlightView multi-file aggregation

- [x] 2.1 Replace single-file render state (`renderedFilePath`, `renderedSearchText`) with a hash of the full active highlight set
- [x] 2.2 Update `refresh()` to iterate over `getAllActive()` instead of only the focused file
- [x] 2.3 Build per-file occurrence lists by reading each active file via `cachedRead` and calling `findOccurrences`
- [x] 2.4 Render each file as a grouped section with a header showing file name and occurrence count
- [x] 2.5 Wire occurrence click handlers to resolve the correct `MarkdownView` leaf for navigation

## 3. Styling

- [x] 3.1 Add `.autolink-hl-file-group` CSS class for file group containers
- [x] 3.2 Add `.autolink-hl-file-header` CSS class for file name / count header styling
- [x] 3.3 Ensure existing `.autolink-hl-item`, `.autolink-hl-lineno`, and `.autolink-highlight` styles remain compatible

## 4. Verification

- [x] 4.1 Test clicking a virtual link with 3+ candidates: all files open and sidebar shows all groups
- [x] 4.2 Test clicking an occurrence in a non-focused file: correct file gains focus and scrolls
- [x] 4.3 Test switching focus between highlighted files: sidebar remains stable (no flash/rebuild)
- [x] 4.4 Test single-candidate fallback: behavior matches original single-file view
- [x] 4.5 Close a highlighted file: its group disappears from the sidebar within one `layout-change` cycle

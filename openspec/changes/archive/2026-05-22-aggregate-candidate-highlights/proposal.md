## Why

When a virtual link points to multiple candidate notes, clicking it opens all of them simultaneously. However, the **Autolink Highlights** sidebar only shows occurrences for the *currently focused* note. Users who want to review every matched occurrence across all opened candidates must repeatedly switch tabs and re-orient themselves. Aggregating all candidate highlights into a single scrollable list removes this friction and makes multi-candidate navigation truly useful.

## What Changes

- **Aggregate highlights across all active candidate files** in the Highlights sidebar, rather than showing only the currently focused file.
- Each file's occurrences appear as a grouped section in the sidebar, stacked vertically in the order the files were opened.
- Clicking an occurrence navigates to the correct file *and* scrolls to the match, exactly as it does today.
- The existing per-file highlight behavior is preserved as a fallback when only a single file is active.
- No changes to the DOM highlight injection (reading mode / live preview) — only the sidebar view changes.

## Capabilities

### New Capabilities
- `aggregate-highlights-view`: Aggregates and displays highlights from all currently active candidate files in the Highlights sidebar, grouped by file.

### Modified Capabilities
- *(none — this is a pure view-layer enhancement; no spec-level behavior changes to highlighting, matching, or virtual-link activation)*

## Impact

- `linker/highlightView.ts` — major refactor of `HighlightView` to support multi-file rendering.
- `linker/highlightService.ts` — minor additions to expose the full set of active highlights.
- `main.ts` — no changes expected (highlight-service API remains backward-compatible).
- `styles.css` — new CSS classes for file-group headers in the sidebar.

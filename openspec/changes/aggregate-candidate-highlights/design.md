## Context

The Autolink plugin already supports:
1. **Virtual links** that can point to multiple candidate notes.
2. An **open-all** action that opens every candidate in its own tab.
3. A **HighlightService** that tracks `filePath → searchText` mappings for active highlights.
4. A **HighlightView** sidebar that renders occurrences for the *single currently focused* file.

The current HighlightView logic:
- Calls `hs.getActive(file.path)` to get the search text for the focused file.
- Reads that one file, finds occurrences, and renders them.
- When the user clicks an occurrence, it focuses that file's leaf and scrolls.

## Goals / Non-Goals

**Goals:**
- Show highlights from **all files that have an active highlight** in the sidebar, not just the focused one.
- Group occurrences by file with a clear visual header (file name + occurrence count).
- Maintain scroll position stability when the user clicks an item (do not re-render aggressively).
- Preserve existing single-file behavior as a fallback when only one highlight is active.

**Non-Goals:**
- Do not change how DOM highlights are injected in reading mode or CM6 decorations in live preview.
- Do not change the virtual-link click or open-all logic.
- Do not add new user settings for this behavior (it becomes the default sidebar behavior).

## Decisions

### 1. Render all active highlights instead of only the focused file
**Rationale**: `HighlightService.activeHighlights` already stores every file with a pending or active highlight. The view can iterate over this map directly rather than querying the focused file. This is the simplest change and leverages existing state.

### 2. Order file groups by activation time (most recent first)
**Rationale**: When a user clicks "open all", files open in sequence. Ordering by when the highlight was activated (via `activateForFile`) matches the user's mental model and the tab order. We will add an `activatedAt` timestamp to the highlight entry.

**Alternative considered**: Alphabetical order. Rejected because it disconnects from the user's open-all sequence and tab bar order.

### 3. Add `getAllActive()` to HighlightService
**Rationale**: The view needs read-only access to every active entry. Exposing a snapshot array keeps the service's encapsulation while giving the view what it needs.

```typescript
interface ActiveHighlightEntry {
    filePath: string;
    searchText: string;
    activatedAt: number;
}
getAllActive(): ActiveHighlightEntry[];
```

### 4. Skip re-render using a hash of the full active set
**Rationale**: Currently `renderedFilePath` + `renderedSearchText` prevents re-render for a single file. For multi-file, we compute a lightweight hash (e.g., JSON of sorted `filePath:searchText` pairs) and only re-render when it changes. This avoids flashing the sidebar on every `active-leaf-change`.

### 5. Navigation focuses the correct leaf before scrolling
**Rationale**: When the user clicks an occurrence in file B while file A is focused, the sidebar must first bring file B's leaf into focus, then scroll. `HighlightView.navigateTo` already does this; it just needs the correct `MarkdownView` instance passed in.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Sidebar list becomes very long if many candidates have many matches | Cap is not needed initially; Obsidian sidebars scroll natively. If performance issues arise, a per-file occurrence cap can be added later. |
| Focus ping-pong: clicking an item focuses its file, which fires `active-leaf-change`, which could clear the list back to single-file mode | `refresh()` already uses `getMostRecentLeaf()` to avoid treating the sidebar as the active view. With the new aggregated model, `active-leaf-change` will still call `refresh()`, but the hash check will prevent re-render because the active highlight set has not changed. |
| Reading file content for every active highlight on every refresh could be expensive | File content is read via `cachedRead`, which is cheap. The hash-based skip-re-render prevents redundant reads. |

## Migration Plan

No migration needed. This is a backward-compatible UI enhancement. Existing single-file highlights continue to work identically.

## Open Questions

- Should there be a per-file collapse/expand affordance in the sidebar? (Deferred; start with a flat expanded list.)

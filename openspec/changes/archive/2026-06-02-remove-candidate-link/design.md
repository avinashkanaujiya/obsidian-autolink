## Context

The Autolink plugin builds a prefix tree from note frontmatter (`aliases` and user-configured custom fields like `keywords`). When a user clicks a virtual link, the Highlights View shows all occurrences across open notes. Today there is no way to dismiss a candidate term without manually editing each note's frontmatter.

The Highlights View already renders per-file groups with occurrence lists — it is the natural place for a "remove this term" action.

## Goals / Non-Goals

**Goals:**
- Let users remove a candidate link term from a note's frontmatter with one click from the Highlights View.
- Immediately update the prefix tree so the term no longer generates virtual links from that note.
- Provide visual feedback confirming the removal.

**Non-Goals:**
- Global blocklist / "never link this term anywhere" — out of scope for this change. Each dismissal is per-note.
- Undo functionality — frontmatter changes are persisted immediately; users can re-add terms manually if needed.
- Modifying the settings UI or adding new settings fields.

## Decisions

### 1. Where to place the dismiss action

**Decision:** Add a small "×" button on each occurrence row in the Highlights View, next to the line number.

**Rationale:** The user is already looking at the term in context. Placing the action inline keeps it discoverable without adding new UI surfaces. The button removes the term from the **source note's** frontmatter (the note being highlighted, not the note the user is editing).

**Alternative considered:** A right-click context menu — rejected because it adds friction and is less discoverable.

### 2. How to mutate frontmatter

**Decision:** Use Obsidian's `app.fileManager.processFrontMatter(filePath, fn)` API.

**Rationale:** This is the official, safe way to edit frontmatter. It handles YAML serialization, preserves comments (in Obsidian ≥1.4), and triggers metadata cache updates automatically.

### 3. Which frontmatter fields to clean

**Decision:** Remove the term from `aliases` AND all configured `customFrontmatterFields`. Do not touch other fields.

**Rationale:** These are exactly the fields the plugin reads when building the prefix tree (see `linkerCache.ts` → `addFileToTree`). Removing from other fields would be surprising.

### 4. How to refresh the prefix tree

**Decision:** After frontmatter mutation, call `linkerCache.updateFiles([filePath])` to re-index only the affected file.

**Rationale:** A full rebuild is unnecessary. The metadata cache update triggered by `processFrontMatter` will fire `metadata-change` events, but calling `updateFiles` explicitly ensures the tree is refreshed immediately in the same tick, before the UI re-renders.

### 5. Highlight cleanup after dismissal

**Decision:** After removing the term from frontmatter, remove the highlight entry for that file from `HighlightService` and trigger a re-render of the Highlights View.

**Rationale:** The term no longer exists in the note's frontmatter, so highlighting it is misleading. Removing the entry keeps the view honest.

## Risks / Trade-offs

- **[Risk] Term appears in body text but not frontmatter** → The dismiss action only removes from frontmatter. If the term still appears in body text, it won't be highlighted anymore (correct behavior — it's no longer a candidate).
- **[Risk] Multiple notes share the same term** → Dismissal is per-note. Other notes keeping the term will still generate virtual links. This is intentional — the user must dismiss per-note.
- **[Risk] Frontmatter mutation race** → Obsidian's `processFrontMatter` is atomic per call. No concurrent writes expected since the user clicks one button at a time.
- **[Trade-off] No undo** → Frontmatter changes are immediate. Users can manually re-add terms. An undo system would add significant complexity for a low-frequency action.

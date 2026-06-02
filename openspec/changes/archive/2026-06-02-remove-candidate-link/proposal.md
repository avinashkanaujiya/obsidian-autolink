## Why

When using the virtual linker, some keywords or aliases generate too many false-positive virtual links because they are common phrases (e.g., "AI", "system", "model"). Currently, the only way to stop these links is to manually open each note and remove the offending term from its frontmatter — a tedious, multi-step process. Users need a fast, inline way to dismiss a candidate link and have it removed from the source note's frontmatter so it never generates a virtual link again.

## What Changes

- Add a "dismiss" action to the Highlights View that removes the matched search term from the source note's `aliases` or configured custom frontmatter fields.
- After dismissal, the virtual link for that term in the current note disappears immediately (highlight removed), and the prefix tree is updated so no future virtual links are generated for that term from that note.
- If the term exists in multiple frontmatter fields (e.g., both `aliases` and `keywords`), remove it from all of them.
- Provide visual feedback (brief toast) confirming which term was removed from which note.

## Capabilities

### New Capabilities

- `dismiss-candidate`: Ability to remove a candidate link term from a note's frontmatter via the Highlights View, preventing future virtual link generation for that term from that note.

### Modified Capabilities

_(none — this is additive; no existing spec-level behavior changes)_

## Impact

- **Code**: `linker/highlightView.ts` (UI button + click handler), `linker/linkerCache.ts` (prefix tree refresh after frontmatter change), `main.ts` (frontmatter mutation utility, settings if needed).
- **Dependencies**: Uses Obsidian's `app.fileManager.processFrontMatter` API for safe frontmatter editing.
- **Scope**: Only affects notes that are currently highlighted; no global settings changes required.

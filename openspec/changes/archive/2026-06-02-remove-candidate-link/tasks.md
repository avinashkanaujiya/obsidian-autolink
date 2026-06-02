## 1. Frontmatter Mutation Utility

- [x] 1.1 Create a utility function `removeTermFromFrontmatter(app, filePath, term)` that uses `app.fileManager.processFrontMatter` to remove the given term from `aliases` and all `customFrontmatterFields`. Remove the field entirely if the array becomes empty.

## 2. Highlights View Dismiss Button

- [x] 2.1 Add a dismiss button (×) element with class `autolink-hl-dismiss` and tooltip "Remove from frontmatter" to each occurrence row in `renderFileGroup`.
- [x] 2.2 Wire the dismiss button click handler to call the frontmatter mutation utility with the correct file path and search text.

## 3. Prefix Tree Refresh

- [x] 3.1 After successful frontmatter mutation, call `linkerCache.updateFiles([filePath])` to re-index the affected note in the prefix tree.

## 4. Highlight Cleanup

- [x] 4.1 After successful frontmatter mutation, remove the active highlight entry from `HighlightService` for the dismissed file/term pair.
- [x] 4.2 Trigger a re-render of the Highlights View to reflect the removal.

## 5. Visual Feedback

- [x] 5.1 Show a success toast: `Removed "<term>" from <filename>` after successful dismissal.
- [x] 5.2 Show an error toast on failure (e.g., file locked, write error).

## 6. Styling

- [x] 6.1 Add CSS for `.autolink-hl-dismiss` button (subtle × icon, hover state, positioned in the occurrence row).

## 7. Testing

- [x] 7.1 Write unit tests for the `removeTermFromFrontmatter` utility covering: term in aliases, term in custom field, term in both, term is last entry.

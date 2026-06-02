## ADDED Requirements

### Requirement: Dismiss button on highlight occurrence rows

The Highlights View SHALL display a dismiss button (×) on each occurrence row, positioned after the line number and before the context snippet.

#### Scenario: Dismiss button visible on occurrence rows
- **WHEN** the Highlights View renders occurrence rows for a highlighted term
- **THEN** each occurrence row SHALL display a dismiss button (×) element with class `autolink-hl-dismiss`

#### Scenario: Dismiss button has accessible tooltip
- **WHEN** the user hovers over the dismiss button
- **THEN** a tooltip SHALL display "Remove from frontmatter" (or similar)

### Requirement: Dismiss action removes term from source note's frontmatter

Clicking the dismiss button SHALL remove the matched search term from the source note's `aliases` field and all configured `customFrontmatterFields`.

#### Scenario: Term exists in aliases
- **WHEN** the user clicks dismiss for term "AI" on a highlight from note "Research.md"
- **AND** "Research.md" has `aliases: ["AI", "ML"]` in frontmatter
- **THEN** "AI" SHALL be removed from the `aliases` array, resulting in `aliases: ["ML"]`

#### Scenario: Term exists in custom frontmatter field
- **WHEN** the user clicks dismiss for term "neural" on a highlight from note "Brain.md"
- **AND** plugin settings have `customFrontmatterFields: ["keywords"]`
- **AND** "Brain.md" has `keywords: ["neural", "cortex"]` in frontmatter
- **THEN** "neural" SHALL be removed from the `keywords` array, resulting in `keywords: ["cortex"]`

#### Scenario: Term exists in both aliases and custom fields
- **WHEN** the user clicks dismiss for term "AI" on a highlight from note "Research.md"
- **AND** "Research.md" has `aliases: ["AI"]` and `keywords: ["AI", "ML"]`
- **THEN** "AI" SHALL be removed from both `aliases` and `keywords`

#### Scenario: Term is the last entry in a field
- **WHEN** the user clicks dismiss for term "AI" on a highlight from note "Research.md"
- **AND** "Research.md" has `aliases: ["AI"]` (only entry)
- **THEN** the `aliases` field SHALL be removed entirely from frontmatter (empty array is pointless)

### Requirement: Prefix tree refresh after dismissal

After frontmatter mutation, the prefix tree SHALL be updated so the dismissed term no longer generates virtual links from that note.

#### Scenario: Tree updated immediately
- **WHEN** the dismiss action completes
- **THEN** `linkerCache.updateFiles([filePath])` SHALL be called to re-index the affected note
- **AND** subsequent virtual link generation SHALL NOT match the dismissed term for that note

### Requirement: Highlight cleanup after dismissal

After dismissing a term, the Highlights View SHALL remove the highlight entry for that file and re-render.

#### Scenario: Highlight entry removed
- **WHEN** the dismiss action completes for term "AI" in note "Research.md"
- **THEN** the active highlight entry for "Research.md" with search text "AI" SHALL be removed from `HighlightService`
- **AND** the Highlights View SHALL re-render without the dismissed file group

### Requirement: Visual feedback on dismissal

The plugin SHALL show a brief toast notification confirming the dismissal.

#### Scenario: Toast shown after successful dismissal
- **WHEN** the dismiss action successfully removes term "AI" from "Research.md"
- **THEN** a notice SHALL display: `Removed "AI" from Research`

#### Scenario: Toast shown on failure
- **WHEN** the dismiss action fails (e.g., file locked, write error)
- **THEN** a notice SHALL display an error message indicating the failure

## ADDED Requirements

### Requirement: Sidebar aggregates highlights from all active candidate files
The Highlights sidebar SHALL display occurrences for every file that currently has an active highlight, grouped by file.

#### Scenario: Multiple candidates opened via virtual link
- **WHEN** a user clicks a virtual link that points to three candidate notes
- **THEN** all three notes open in separate tabs
- **AND** the Highlights sidebar shows a grouped list of occurrences for all three notes

#### Scenario: Single candidate highlight fallback
- **WHEN** only one file has an active highlight
- **THEN** the sidebar behaves identically to the previous single-file view

### Requirement: File groups ordered by activation time
File groups in the sidebar SHALL be ordered by the time each highlight was activated, with the most recently activated file first.

#### Scenario: Open-all activation order
- **WHEN** four candidate files are opened sequentially via open-all
- **THEN** their highlight groups appear in the sidebar in the same order they were activated

### Requirement: Clicking an occurrence navigates to the correct file and match
Clicking any occurrence in the sidebar SHALL focus the corresponding file's leaf and scroll to the matched line.

#### Scenario: Navigate to a different file's occurrence
- **WHEN** a user clicks an occurrence belonging to a file that is not currently focused
- **THEN** the file's leaf receives focus
- **AND** the editor or preview scrolls to the matched line

### Requirement: Stable render with hash-based deduplication
The sidebar SHALL avoid redundant re-renders when the set of active highlights has not changed.

#### Scenario: Active leaf change with same highlight set
- **WHEN** the user switches focus between two files that both have active highlights
- **THEN** the sidebar list remains visually stable and does not flash or rebuild

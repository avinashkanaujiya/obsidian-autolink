import { ItemView, MarkdownView, TFile, WorkspaceLeaf } from 'obsidian';
import { LinkerPluginSettings } from 'main';
import { ActiveHighlightEntry, findFirstMatch, HighlightService } from './highlightService';
import { ExternalUpdateManager } from './linkerCache';
import { removeTermFromFrontmatter } from './frontmatterUtils';

export const HIGHLIGHT_VIEW_TYPE = 'autolink-highlight-view';

interface Occurrence {
    index:     number;   // 0-based rank, used as a fallback when source-line metadata is unavailable
    line:      number;   // 0-based line in the file
    ch:        number;   // 0-based column where the match starts
    matchText: string;   // exact matched text (preserves casing)
    rawLine:   string;   // full raw line for context display
}

interface FileGroup {
    filePath:    string;
    fileName:    string;
    searchText:  string;
    view:        MarkdownView | null;
    occurrences: Occurrence[];
}

export class HighlightView extends ItemView {
    private unsubHighlight: (() => void) | null = null;

    // Hash of the last-rendered active-highlight set to skip redundant re-renders.
    private renderedHash: string | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        private readonly hs: HighlightService,
        private readonly settings: LinkerPluginSettings,
        private readonly updateManager: ExternalUpdateManager,
    ) {
        super(leaf);
    }

    getViewType()    { return HIGHLIGHT_VIEW_TYPE; }
    getDisplayText() { return 'Autolink Highlights'; }
    getIcon()        { return 'highlighter'; }

    async onOpen(): Promise<void> {
        this.contentEl.addClass('autolink-highlight-view');

        this.unsubHighlight = this.hs.onUpdate(() => {
            // Force a full re-render when highlights change.
            this.renderedHash = null;
            this.refresh();
        });

        // Refresh when the user switches panes or changes the file inside the
        // same pane. active-leaf-change alone misses tab switches within the
        // current leaf, while file-open alone misses focus changes between
        // already-open panes.
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => this.refresh())
        );
        this.registerEvent(
            this.app.workspace.on('file-open', () => this.refresh())
        );

        await this.refresh();
    }

    async onClose(): Promise<void> {
        this.unsubHighlight?.();
        this.unsubHighlight = null;
    }

    // -------------------------------------------------------------------------
    // Core refresh

    async refresh(): Promise<void> {
        const activeEntries = this.hs.getAllActive();

        // ── Nothing to show ─────────────────────────────────────────────────
        if (activeEntries.length === 0) {
            this.renderedHash = null;
            this.contentEl.empty();
            this.renderEmpty('No active highlights.\nClick a virtual link to highlight text here.');
            return;
        }

        const hash = this.computeHash(activeEntries);
        if (hash === this.renderedHash) {
            return;
        }

        this.renderedHash = hash;

        // ── Build per-file occurrence groups ──────────────────────────────────
        const groups: FileGroup[] = [];
        for (const entry of activeEntries) {
            const file = this.app.vault.getAbstractFileByPath(entry.filePath);
            if (!(file instanceof TFile)) continue;

            let content: string;
            try {
                content = await this.app.vault.cachedRead(file);
            } catch {
                continue;
            }

            const fileCache = this.app.metadataCache.getFileCache(file);
            const fmEndLine = fileCache?.frontmatterPosition?.end.line ?? -1;
            const startLine = fmEndLine >= 0 ? fmEndLine + 1 : 0;
            const occurrences = this.findOccurrences(content, entry.searchText, startLine);

            groups.push({
                filePath: entry.filePath,
                fileName: file.basename,
                searchText: entry.searchText,
                view: this.findMarkdownViewForFile(entry.filePath),
                occurrences,
            });
        }

        this.contentEl.empty();

        if (groups.length === 0) {
            this.renderEmpty('No occurrences found in active notes.');
            return;
        }

        // ── Global header (search term) ──────────────────────────────────────
        // If every group shares the same search text, show it once at the top.
        const allSameSearch = groups.every(g => g.searchText === groups[0].searchText);
        if (allSameSearch) {
            const hdr = this.contentEl.createDiv({ cls: 'autolink-hl-header' });
            hdr.createEl('div', { cls: 'autolink-hl-term' }).setText(`"${groups[0].searchText}"`);
        }

        // ── Render each file group ───────────────────────────────────────────
        for (const group of groups) {
            this.renderFileGroup(group);
        }
    }

    // -------------------------------------------------------------------------
    // Hash & helpers

    private computeHash(entries: ActiveHighlightEntry[]): string {
        // Stable hash: sort by filePath so order doesn't depend on activation time.
        const sorted = [...entries].sort((a, b) => a.filePath.localeCompare(b.filePath));
        return JSON.stringify(sorted.map(e => [e.filePath, e.searchText]));
    }

    private findMarkdownViewForFile(filePath: string): MarkdownView | null {
        const leaves = this.app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
            const view = leaf.view;
            if (view instanceof MarkdownView && view.file?.path === filePath) {
                return view;
            }
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // Finding occurrences

    private findOccurrences(content: string, searchText: string, startLine = 0): Occurrence[] {
        const lines  = content.split('\n');
        const result: Occurrence[] = [];

        for (let lineNum = startLine; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            const match = findFirstMatch(line, searchText);
            if (!match) continue;

            result.push({
                index:     result.length,
                line:      lineNum,
                ch:        match.index,
                matchText: match.matchText,
                rawLine:   line,
            });
        }
        return result;
    }

    // -------------------------------------------------------------------------
    // Rendering

    private renderEmpty(msg: string): void {
        this.contentEl.createDiv({ cls: 'autolink-hl-empty' }).setText(msg);
    }

    private renderFileGroup(group: FileGroup): void {
        const root = this.contentEl;

        const groupEl = root.createDiv({ cls: 'autolink-hl-file-group' });

        // File header
        const hdr = groupEl.createDiv({ cls: 'autolink-hl-file-header' });
        hdr.createEl('span', { cls: 'autolink-hl-filename' }).setText(group.fileName);
        hdr.createEl('span', { cls: 'autolink-hl-count' }).setText(
            `${group.occurrences.length}`
        );

        if (group.occurrences.length === 0) {
            groupEl.createDiv({ cls: 'autolink-hl-empty' })
                .setText('No occurrences found in note body');
            return;
        }

        const list = groupEl.createDiv({ cls: 'autolink-hl-list' });

        for (const occ of group.occurrences) {
            const item = list.createDiv({ cls: 'autolink-hl-item' });
            item.setAttribute('title', `Jump to line ${occ.line + 1}`);

            // Dismiss button — removes the search term from this note's frontmatter
            const dismissBtn = item.createEl('button', { cls: 'autolink-hl-dismiss' });
            dismissBtn.textContent = '×';
            dismissBtn.setAttribute('aria-label', 'Remove from frontmatter');
            dismissBtn.setAttribute('title', 'Remove from frontmatter');
            dismissBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                void this.handleDismiss(group.filePath, group.searchText, group.fileName);
            });

            item.createEl('span', { cls: 'autolink-hl-lineno' })
                .setText(`L${occ.line + 1}`);

            this.renderContextLine(
                item.createEl('span', { cls: 'autolink-hl-ctx' }),
                occ.rawLine, occ.ch, occ.matchText,
            );

            item.addEventListener('click', () => {
                const view = group.view ?? this.findMarkdownViewForFile(group.filePath);
                if (view) {
                    this.navigateTo(view, occ);
                }
            });
        }
    }

    // -------------------------------------------------------------------------
    // Dismiss action

    private async handleDismiss(filePath: string, term: string, fileName: string): Promise<void> {
        const modified = await removeTermFromFrontmatter(
            this.app,
            this.settings,
            this.updateManager,
            filePath,
            term,
        );

        if (modified) {
            // Remove the highlight entry so the view re-renders without this file
            this.hs.removeActive(filePath, term);
        }
    }

    // -------------------------------------------------------------------------
    // Context line rendering

    /** Render a windowed snippet centred on the chosen match, highlighting it once. */
    private renderContextLine(
        el: HTMLElement,
        rawLine: string,
        matchStart: number,
        matchText: string,
    ): void {
        const WINDOW = 72;
        const PAD    = 20;

        let start = Math.max(0, matchStart - PAD);
        const end   = Math.min(rawLine.length, Math.max(matchStart + matchText.length, start + WINDOW));
        start     = Math.max(0, end - WINDOW);

        const prefix = start > 0            ? '…' : '';
        const suffix = end < rawLine.length ? '…' : '';
        const slice  = rawLine.slice(start, end);

        const frag = document.createDocumentFragment();
        const relStart = Math.max(0, matchStart - start);
        const relEnd = Math.min(slice.length, relStart + matchText.length);

        if (prefix) frag.appendChild(document.createTextNode(prefix));
        if (relStart > 0) {
            frag.appendChild(document.createTextNode(slice.slice(0, relStart)));
        }

        const mark = document.createElement('mark');
        mark.className = 'autolink-highlight';
        mark.textContent = slice.slice(relStart, relEnd);
        frag.appendChild(mark);

        if (relEnd < slice.length) {
            frag.appendChild(document.createTextNode(slice.slice(relEnd)));
        }
        if (suffix) {
            frag.appendChild(document.createTextNode(suffix));
        }

        el.appendChild(frag);
    }

    // -------------------------------------------------------------------------
    // Navigation

    private findRenderedPreviewOccurrence(view: MarkdownView, occ: Occurrence): HTMLElement | null {
        const previewRoot = (
            (view.previewMode as { containerEl?: HTMLElement } | undefined)?.containerEl ??
            view.contentEl
        );

        // Reading mode only renders some sections eagerly, so the global nth
        // <mark> is not stable on long notes. Prefer the source-line metadata
        // added by applyHighlightToDOM(); fall back to the old nth-mark lookup
        // only when that metadata is unavailable.
        const byLine = previewRoot.querySelector(
            `mark.autolink-highlight[data-autolink-source-line="${occ.line}"]`
        );
        if (byLine instanceof HTMLElement) return byLine;

        const marks = previewRoot.querySelectorAll('mark.autolink-highlight');
        const byIndex = marks[occ.index];
        return byIndex instanceof HTMLElement ? byIndex : null;
    }

    private queuePreviewOccurrenceScroll(
        view: MarkdownView,
        occ: Occurrence,
        attempt = 0,
        previewKickDone = false,
    ): void {
        const MAX_ATTEMPTS = 12;
        const RETRY_MS = 120;

        const target = this.findRenderedPreviewOccurrence(view, occ);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        if (attempt >= MAX_ATTEMPTS) return;

        let nextPreviewKickDone = previewKickDone;
        if (view.getMode?.() === 'preview' && !previewKickDone) {
            const previewStateView = view as MarkdownView & {
                getEphemeralState?: () => Record<string, unknown> | null | undefined;
                setEphemeralState?: (state: Record<string, unknown>) => void;
            };
            const currentState = previewStateView.getEphemeralState?.() ?? {};
            previewStateView.setEphemeralState?.({
                ...currentState,
                line: occ.line,
            });
            nextPreviewKickDone = true;
        }

        setTimeout(() => {
            this.queuePreviewOccurrenceScroll(view, occ, attempt + 1, nextPreviewKickDone);
        }, attempt === 0 ? 60 : RETRY_MS);
    }

    private navigateTo(view: MarkdownView, occ: Occurrence): void {
        const pos    = { line: occ.line, ch: occ.ch };
        const endPos = { line: occ.line, ch: occ.ch + occ.matchText.length };

        // ── Live preview / source: cursor-based (always works) ────────────────
        if (view.getMode?.() !== 'preview') {
            const editor = view.editor;
            if (editor) {
                editor.setCursor(pos);
                editor.scrollIntoView({ from: pos, to: endPos }, true);
            }
        }

        // ── Reading mode: jump the preview near the source line, then poll for
        // the actual rendered <mark>. This is more reliable for long notes and
        // tables than assuming every highlighted mark is already in the DOM.
        if (view.getMode?.() === 'preview') {
            this.queuePreviewOccurrenceScroll(view, occ);
        }

        // ── Bring the note leaf into focus LAST ───────────────────────────────
        // We do this after the scroll calls so the scroll is already queued
        // before focus triggers active-leaf-change → refresh.
        // Because refresh() now renders all active highlights, bringing this
        // leaf into focus does not clear the sidebar list.
        this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
    }
}

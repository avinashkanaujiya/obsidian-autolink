import { ItemView, MarkdownView, WorkspaceLeaf } from 'obsidian';
import { findFirstMatch, HighlightService } from './highlightService';

export const HIGHLIGHT_VIEW_TYPE = 'autolink-highlight-view';

interface Occurrence {
    index:     number;   // 0-based rank, used as a fallback when source-line metadata is unavailable
    line:      number;   // 0-based line in the file
    ch:        number;   // 0-based column where the match starts
    matchText: string;   // exact matched text (preserves casing)
    rawLine:   string;   // full raw line for context display
}

export class HighlightView extends ItemView {
    private unsubHighlight: (() => void) | null = null;

    // Track what we last rendered to skip redundant re-renders (prevents flash
    // when active-leaf-change fires while we are already showing the right data).
    private renderedFilePath:   string | null = null;
    private renderedSearchText: string | null = null;

    constructor(leaf: WorkspaceLeaf, private readonly hs: HighlightService) {
        super(leaf);
    }

    getViewType()    { return HIGHLIGHT_VIEW_TYPE; }
    getDisplayText() { return 'Autolink Highlights'; }
    getIcon()        { return 'highlighter'; }

    async onOpen(): Promise<void> {
        this.contentEl.addClass('autolink-highlight-view');

        this.unsubHighlight = this.hs.onUpdate(() => {
            // Force a full re-render when highlights change.
            this.renderedFilePath = null;
            this.renderedSearchText = null;
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
        // ── Find the note the user is actually reading ───────────────────────
        // IMPORTANT: do NOT use getActiveViewOfType(MarkdownView) — it returns
        // null whenever this sidebar panel itself is the focused leaf. Instead,
        // we resolve the most recently active Markdown leaf and only show
        // highlights for that visible note.
        const targetView = this.findCurrentVisibleMarkdownView();
        const file = targetView?.file ?? null;
        const searchText = file ? this.hs.getActive(file.path) : undefined;

        // ── Nothing to show ──────────────────────────────────────────────────
        if (!targetView || !file || !searchText) {
            this.renderedFilePath   = null;
            this.renderedSearchText = null;
            this.contentEl.empty();
            this.renderEmpty('No active highlights.\nClick a virtual link to highlight text here.');
            return;
        }

        // Skip re-render if we are already showing this file + search text.
        if (file.path === this.renderedFilePath && searchText === this.renderedSearchText) {
            return;
        }

        this.renderedFilePath   = file.path;
        this.renderedSearchText = searchText;

        let content: string;
        try {
            content = await this.app.vault.cachedRead(file);
        } catch {
            this.contentEl.empty();
            this.renderEmpty('Could not read file');
            return;
        }

        const fileCache   = this.app.metadataCache.getFileCache(file);
        // Skip frontmatter lines: matches there (e.g. aliases: tiger reserve)
        // are metadata, not body content, and the Properties widget hides them
        // in rendered view so scrolling there is disorienting.
        const fmEndLine  = fileCache?.frontmatterPosition?.end.line ?? -1;
        const startLine  = fmEndLine >= 0 ? fmEndLine + 1 : 0;
        const occurrences = this.findOccurrences(content, searchText, startLine);

        this.contentEl.empty();
        this.renderOccurrences(targetView, file.basename, searchText, occurrences);
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
    // Finding the currently visible note

    /**
     * Returns the Markdown view whose contents are currently visible to the
     * user, even if this sidebar view has focus.
     *
     * We prefer getMostRecentLeaf() because it tracks the note pane the user
     * was just reading while a sidebar leaf is active. If that is unavailable,
     * we fall back to getActiveFile() and locate the matching Markdown leaf.
     */
    private findCurrentVisibleMarkdownView(): MarkdownView | null {
        const recentLeaf = this.app.workspace.getMostRecentLeaf?.();
        const recentView = recentLeaf?.view;
        if (recentView instanceof MarkdownView && recentView.file) {
            return recentView;
        }

        const activeFile = this.app.workspace.getActiveFile?.();
        if (!activeFile) return null;

        const leaves = this.app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
            const view = leaf.view;
            if (view instanceof MarkdownView && view.file?.path === activeFile.path) {
                return view;
            }
        }

        return null;
    }

    // -------------------------------------------------------------------------
    // Rendering

    private renderEmpty(msg: string): void {
        this.contentEl.createDiv({ cls: 'autolink-hl-empty' }).setText(msg);
    }

    private renderOccurrences(
        view: MarkdownView,
        fileName: string,
        searchText: string,
        occurrences: Occurrence[],
    ): void {
        const root = this.contentEl;

        // Header
        const hdr = root.createDiv({ cls: 'autolink-hl-header' });
        hdr.createEl('div', { cls: 'autolink-hl-term' }).setText(`"${searchText}"`);
        hdr.createEl('div', { cls: 'autolink-hl-subtitle' }).setText(fileName);

        if (occurrences.length === 0) {
            root.createDiv({ cls: 'autolink-hl-empty' })
                .setText('No occurrences found in note body');
            return;
        }

        root.createEl('div', { cls: 'autolink-hl-count' }).setText(
            `${occurrences.length} occurrence${occurrences.length === 1 ? '' : 's'}`
        );

        const list = root.createDiv({ cls: 'autolink-hl-list' });

        for (const occ of occurrences) {
            const item = list.createDiv({ cls: 'autolink-hl-item' });
            item.setAttribute('title', `Jump to line ${occ.line + 1}`);

            item.createEl('span', { cls: 'autolink-hl-lineno' })
                .setText(`L${occ.line + 1}`);

            this.renderContextLine(
                item.createEl('span', { cls: 'autolink-hl-ctx' }),
                occ.rawLine, occ.ch, occ.matchText,
            );

            item.addEventListener('click', () => this.navigateTo(view, occ));
        }
    }

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
        // Because refresh() now resolves the most recently active Markdown
        // leaf (instead of the focused sidebar leaf), bringing this leaf into
        // focus no longer clears the sidebar list.
        this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
    }
}

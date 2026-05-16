import { ItemView, MarkdownView, TFile, WorkspaceLeaf } from 'obsidian';
import { HighlightService, escapeRegex } from './highlightService';

export const HIGHLIGHT_VIEW_TYPE = 'autolink-highlight-view';

interface Occurrence {
    index:     number;   // 0-based rank, used to find the nth <mark>
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

        // Refresh when the user switches notes.
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => this.refresh())
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
        // ── Find a view with an active highlight ─────────────────────────────
        // IMPORTANT: do NOT use getActiveViewOfType(MarkdownView) — it returns
        // null whenever this sidebar panel itself is the focused leaf.  We scan
        // all leaves to find the note with an active highlight regardless of
        // which pane is currently focused.
        const target = this.findHighlightedView();

        // ── Nothing to show ──────────────────────────────────────────────────
        if (!target) {
            this.renderedFilePath   = null;
            this.renderedSearchText = null;
            this.contentEl.empty();
            this.renderEmpty('No active highlights.\nClick a virtual link to highlight text here.');
            return;
        }

        const targetView = target.view;
        const searchText = target.searchText;
        const file       = target.file;

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
        const regex  = new RegExp(escapeRegex(searchText), 'gi');
        const result: Occurrence[] = [];

        for (let lineNum = startLine; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            let m: RegExpExecArray | null;
            while ((m = regex.exec(line)) !== null) {
                result.push({
                    index:     result.length,
                    line:      lineNum,
                    ch:        m.index,
                    matchText: m[0],
                    rawLine:   line,
                });
            }
        }
        return result;
    }

    // -------------------------------------------------------------------------
    // Finding the view with an active highlight

    /**
     * Scans every open leaf and returns the first MarkdownView that has an
     * active highlight.  Returns null if none exist.
     *
     * Typed with a concrete return object so TypeScript's control-flow
     * narrowing doesn't collapse the caller's local variables to 'never'.
     */
    private findHighlightedView(): { view: MarkdownView; file: TFile; searchText: string } | null {
        const leaves = this.app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
            const v = leaf.view as MarkdownView;
            if (!v.file) continue;
            const st = this.hs.getActive(v.file.path);
            if (st) return { view: v, file: v.file, searchText: st };
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

    /** Render a windowed snippet centred on the match, with match highlighted. */
    private renderContextLine(
        el: HTMLElement,
        rawLine: string,
        matchStart: number,
        matchText: string,
    ): void {
        const WINDOW = 72;
        const PAD    = 20;

        let start = Math.max(0, matchStart - PAD);
        const end   = Math.min(rawLine.length, start + WINDOW);
        start     = Math.max(0, end - WINDOW);

        const prefix = start > 0            ? '…' : '';
        const suffix = end < rawLine.length ? '…' : '';
        const slice  = rawLine.slice(start, end);

        const frag  = document.createDocumentFragment();
        const regex = new RegExp(escapeRegex(matchText), 'gi');
        let last = 0, m: RegExpExecArray | null;

        if (prefix) frag.appendChild(document.createTextNode(prefix));

        while ((m = regex.exec(slice)) !== null) {
            if (m.index > last)
                frag.appendChild(document.createTextNode(slice.slice(last, m.index)));
            const mark = document.createElement('mark');
            mark.className = 'autolink-highlight';
            mark.textContent = m[0];
            frag.appendChild(mark);
            last = m.index + m[0].length;
        }

        if (last < slice.length)
            frag.appendChild(document.createTextNode(slice.slice(last)));
        if (suffix)
            frag.appendChild(document.createTextNode(suffix));

        el.appendChild(frag);
    }

    // -------------------------------------------------------------------------
    // Navigation

    private navigateTo(view: MarkdownView, occ: Occurrence): void {
        const pos    = { line: occ.line, ch: occ.ch };
        const endPos = { line: occ.line, ch: occ.ch + occ.matchText.length };

        // ── Live preview / source: cursor-based (always works) ────────────────
        const editor = view.editor;
        if (editor) {
            editor.setCursor(pos);
            editor.scrollIntoView({ from: pos, to: endPos }, true);
        }

        // ── Reading mode: scroll to the nth <mark> DOM element ────────────────
        setTimeout(() => {
            const marks  = view.contentEl.querySelectorAll('mark.autolink-highlight');
            const target = marks[occ.index];
            if (target instanceof HTMLElement)
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 60);

        // ── Bring the note leaf into focus LAST ───────────────────────────────
        // We do this after the scroll calls so the scroll is already queued
        // before focus triggers active-leaf-change → refresh.
        // Because refresh() now uses iterateAllLeaves (not getActiveViewOfType),
        // bringing this leaf into focus no longer clears the sidebar list.
        this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
    }
}

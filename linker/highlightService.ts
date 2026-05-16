import type { MarkdownSectionInformation } from 'obsidian';

/**
 * HighlightService: tracks which search text should be highlighted in a note
 * after the user navigates to it by clicking a virtual link with display text.
 *
 * Lifecycle:
 *   1. User clicks a .virtual-link-a → setPending(filePath, searchText)
 *   2. workspace 'file-open' event fires → activateForFile(filePath)
 *      → moves pending to active, returns the searchText
 *   3. Highlight is applied (DOM for reading mode, CM6 decorations for live preview)
 *   4. workspace 'layout-change' event fires → clearStale(openFilePaths)
 *      → removes highlights for notes that are no longer open
 */
export class HighlightService {
    /** filePath → searchText currently active for that note */
    private readonly activeHighlights = new Map<string, string>();

    /** One-shot pending highlight, waiting for the target file to open */
    private pending: { filePath: string; searchText: string } | null = null;

    /** Subscribers notified whenever the active highlights change */
    private readonly updateCallbacks = new Set<() => void>();

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /** Call when a virtual link with display text is clicked. */
    setPending(filePath: string, searchText: string): void {
        this.pending = { filePath, searchText };
    }

    /**
     * Call on workspace 'file-open'.  Promotes a matching pending highlight to
     * active.  Returns the active searchText for this file (if any).
     */
    activateForFile(filePath: string): string | undefined {
        if (this.pending?.filePath === filePath) {
            this.activeHighlights.set(filePath, this.pending.searchText);
            this.pending = null;
            this.notifyUpdate();
        }
        return this.activeHighlights.get(filePath);
    }

    /** Returns the active search text for a file, or undefined if none. */
    getActive(filePath: string): string | undefined {
        return this.activeHighlights.get(filePath);
    }

    /**
     * Call on workspace 'layout-change' to remove highlights for closed notes.
     * Pass the set of file paths currently open in any leaf.
     */
    clearStale(openFilePaths: Set<string>): void {
        let changed = false;
        for (const path of [...this.activeHighlights.keys()]) {
            if (!openFilePaths.has(path)) {
                this.activeHighlights.delete(path);
                changed = true;
            }
        }
        if (changed) this.notifyUpdate();
    }

    /** Subscribe to active-highlight changes (returns an unsubscribe fn). */
    onUpdate(cb: () => void): () => void {
        this.updateCallbacks.add(cb);
        return () => this.updateCallbacks.delete(cb);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private notifyUpdate(): void {
        for (const cb of this.updateCallbacks) cb();
    }
}

// -------------------------------------------------------------------------
// DOM highlight helper — used by the reading-mode post-processor and the
// direct DOM manipulation fallback when a note is already rendered.
// -------------------------------------------------------------------------

/** Escape a string so it can be used inside a RegExp literal. */
export function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface TextMatch {
    index: number;
    matchText: string;
}

export type HighlightSectionInfo = Pick<MarkdownSectionInformation, 'text' | 'lineStart'>;

export class SectionSourceMapper {
    private cursor = 0;
    private readonly lineOffsets: number[] = [0];

    constructor(
        private readonly sourceText: string,
        private readonly lineStart = 0,
    ) {
        for (let i = 0; i < sourceText.length; i++) {
            if (sourceText.charCodeAt(i) === 10) {
                this.lineOffsets.push(i + 1);
            }
        }
    }

    locate(text: string): number | null {
        if (!text) return this.cursor;

        const index = this.sourceText.indexOf(text, this.cursor);
        if (index === -1) return null;

        this.cursor = index + text.length;
        return index;
    }

    lineNumberAt(sectionOffset: number): number {
        let low = 0;
        let high = this.lineOffsets.length - 1;
        let lineIndex = 0;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (this.lineOffsets[mid] <= sectionOffset) {
                lineIndex = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        return this.lineStart + lineIndex;
    }
}

/**
 * Finds the first case-insensitive match of `searchText` in `text`.
 */
export function findFirstMatch(text: string, searchText: string): TextMatch | null {
    if (!searchText) return null;

    const match = new RegExp(escapeRegex(searchText), 'i').exec(text);
    if (!match) return null;

    return {
        index: match.index,
        matchText: match[0],
    };
}

/**
 * Inject `<mark class="autolink-highlight">` around the first case-insensitive
 * occurrence of `searchText` per source line inside `containerEl`, when source
 * section information is available. Falls back to rendered-line heuristics when
 * section info is unavailable. Calling this again removes previous marks before
 * adding new ones.
 */
export function applyHighlightToDOM(
    containerEl: HTMLElement,
    searchText: string,
    sectionInfo: HighlightSectionInfo | null = null,
): void {
    // Remove previous highlights so repeated calls are idempotent.
    containerEl.querySelectorAll('mark.autolink-highlight').forEach(mark => {
        const parent = mark.parentNode;
        if (!parent) return;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
    });

    if (!searchText) return;

    const regex = new RegExp(escapeRegex(searchText), 'gi');
    const sourceMapper = sectionInfo ? new SectionSourceMapper(sectionInfo.text, sectionInfo.lineStart) : null;
    const highlightedSourceLines = new Set<number>();

    // Walk only plain text nodes; skip code, pre, script, style, and the
    // Obsidian Properties / frontmatter panel (.metadata-container).
    const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            if (parent.closest('code, pre, script, style, .metadata-container, a.internal-link:not(.virtual-link-a), a.external-link, .tag'))
                return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        },
    });

    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) textNodes.push(node as Text);

    let firstMark: HTMLElement | null = null;

    for (const textNode of textNodes) {
        const text = textNode.textContent ?? '';
        if (!text) continue;

        const parent = textNode.parentNode;
        if (!parent) continue;

        const mappedStart = sourceMapper?.locate(text) ?? null;
        const fallbackHighlightedRenderedLines = new Set<number>();
        const frag = document.createDocumentFragment();
        let replaced = false;
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        regex.lastIndex = 0;
        while ((match = regex.exec(text)) !== null) {
            let shouldHighlight = false;

            if (mappedStart != null && sourceMapper) {
                const sourceLine = sourceMapper.lineNumberAt(mappedStart + match.index);
                if (!highlightedSourceLines.has(sourceLine)) {
                    highlightedSourceLines.add(sourceLine);
                    shouldHighlight = true;
                }
            } else {
                const renderedLine = (text.slice(0, match.index).match(/\n/g) ?? []).length;
                if (!fallbackHighlightedRenderedLines.has(renderedLine)) {
                    fallbackHighlightedRenderedLines.add(renderedLine);
                    shouldHighlight = true;
                }
            }

            if (!shouldHighlight) {
                continue;
            }

            if (match.index > lastIndex) {
                frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }

            const mark = document.createElement('mark');
            mark.className = 'autolink-highlight';
            mark.textContent = match[0];
            frag.appendChild(mark);
            if (!firstMark) firstMark = mark;

            lastIndex = match.index + match[0].length;
            replaced = true;
        }

        if (replaced) {
            if (lastIndex < text.length) {
                frag.appendChild(document.createTextNode(text.slice(lastIndex)));
            }
            parent.replaceChild(frag, textNode);
        }
    }

    if (firstMark) {
        // Scrolling is handled by the caller (main.ts) with an appropriate
        // delay once the note has fully rendered — nothing to do here.
        void firstMark; // keep the reference used above
    }
}

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

/**
 * Inject `<mark class="autolink-highlight">` around every case-insensitive
 * occurrence of `searchText` inside `containerEl`, then scroll to the first
 * match.  Calling this again removes previous marks before adding new ones.
 */
export function applyHighlightToDOM(containerEl: HTMLElement, searchText: string): void {
    // Remove previous highlights so repeated calls are idempotent.
    containerEl.querySelectorAll('mark.autolink-highlight').forEach(mark => {
        const parent = mark.parentNode;
        if (!parent) return;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
    });

    if (!searchText) return;

    const regex = new RegExp(escapeRegex(searchText), 'gi');

    // Walk only plain text nodes; skip code, pre, script, style.
    const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            if (parent.closest('code, pre, script, style')) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        },
    });

    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) textNodes.push(node as Text);

    let firstMark: HTMLElement | null = null;

    for (const textNode of textNodes) {
        const text = textNode.textContent ?? '';
        if (!regex.test(text)) { regex.lastIndex = 0; continue; }
        regex.lastIndex = 0;

        const parent = textNode.parentNode;
        if (!parent) continue;

        const frag = document.createDocumentFragment();
        let lastIndex = 0;
        let m: RegExpExecArray | null;

        while ((m = regex.exec(text)) !== null) {
            if (m.index > lastIndex) {
                frag.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
            }
            const mark = document.createElement('mark');
            mark.className = 'autolink-highlight';
            mark.textContent = m[0];
            frag.appendChild(mark);
            if (!firstMark) firstMark = mark;
            lastIndex = m.index + m[0].length;
        }

        if (lastIndex < text.length) {
            frag.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        parent.replaceChild(frag, textNode);
    }

    if (firstMark) {
        // Give the browser one paint cycle before scrolling.
        setTimeout(() => firstMark!.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    }
}

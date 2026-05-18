import { MarkdownView, TFile } from 'obsidian';
import { HighlightService } from '../linker/highlightService';
import { HighlightView } from '../linker/highlightView';

function activateHighlight(hs: HighlightService, filePath: string, searchText: string): void {
    hs.setPending(filePath, searchText);
    hs.activateForFile(filePath);
}

function makeMarkdownFile(path: string): TFile {
    const base = path.split('/').pop() ?? path;
    return {
        path,
        basename: base.replace(/\.md$/, ''),
        extension: 'md',
        stat: { mtime: 1000, ctime: 1000, size: 0 },
        parent: null,
    } as unknown as TFile;
}

function makeMarkdownView(path: string): MarkdownView & { file: TFile } {
    const view = Object.create(MarkdownView.prototype) as MarkdownView & {
        file: TFile;
        leaf: unknown;
    };
    view.file = makeMarkdownFile(path);
    (view as any).leaf = { view };
    return view;
}

function makeHighlightView(params: {
    hs: HighlightService;
    recentView?: (MarkdownView & { file: TFile }) | null;
    activeFile?: TFile | null;
    leaves: Array<MarkdownView & { file: TFile }>;
}) {
    const view = new HighlightView({} as any, params.hs) as any;

    view.contentEl = { empty: jest.fn() };
    view.renderOccurrences = jest.fn();
    view.renderEmpty = jest.fn();
    view.app = {
        workspace: {
            getMostRecentLeaf: jest.fn(() => (params.recentView ? { view: params.recentView } : null)),
            getActiveFile: jest.fn(() => params.activeFile ?? params.recentView?.file ?? null),
            getLeavesOfType: jest.fn(() => params.leaves.map((leafView) => ({ view: leafView }))),
        },
        vault: {
            cachedRead: jest.fn(async () => 'alpha\nsecond\nbeta'),
        },
        metadataCache: {
            getFileCache: jest.fn(() => null),
        },
    };

    return view;
}

describe('HighlightView.findOccurrences', () => {
    it('keeps only the first occurrence per line', () => {
        const view = new HighlightView({} as any, new HighlightService()) as any;

        const occurrences = view.findOccurrences(
            'alpha alpha\nbeta alpha alpha\nno match here\nALPHA again',
            'alpha',
            0,
        );

        expect(occurrences).toEqual([
            {
                index: 0,
                line: 0,
                ch: 0,
                matchText: 'alpha',
                rawLine: 'alpha alpha',
            },
            {
                index: 1,
                line: 1,
                ch: 5,
                matchText: 'alpha',
                rawLine: 'beta alpha alpha',
            },
            {
                index: 2,
                line: 3,
                ch: 0,
                matchText: 'ALPHA',
                rawLine: 'ALPHA again',
            },
        ]);
    });
});

describe('HighlightView.refresh', () => {
    it('renders highlights for the currently visible note, not the first open highlighted note', async () => {
        const hs = new HighlightService();
        activateHighlight(hs, 'Notes/First.md', 'alpha');
        activateHighlight(hs, 'Notes/Second.md', 'beta');

        const firstView = makeMarkdownView('Notes/First.md');
        const secondView = makeMarkdownView('Notes/Second.md');
        const highlightView = makeHighlightView({
            hs,
            recentView: secondView,
            leaves: [firstView, secondView],
        });

        await highlightView.refresh();

        expect(highlightView.app.vault.cachedRead).toHaveBeenCalledWith(secondView.file);
        expect(highlightView.renderOccurrences).toHaveBeenCalledWith(
            secondView,
            'Second',
            'beta',
            expect.any(Array)
        );
        expect(highlightView.renderEmpty).not.toHaveBeenCalled();
    });

    it('shows an empty state when the visible note has no active highlight', async () => {
        const hs = new HighlightService();
        activateHighlight(hs, 'Notes/First.md', 'alpha');

        const firstView = makeMarkdownView('Notes/First.md');
        const secondView = makeMarkdownView('Notes/Second.md');
        const highlightView = makeHighlightView({
            hs,
            recentView: secondView,
            leaves: [firstView, secondView],
        });

        await highlightView.refresh();

        expect(highlightView.app.vault.cachedRead).not.toHaveBeenCalled();
        expect(highlightView.renderOccurrences).not.toHaveBeenCalled();
        expect(highlightView.renderEmpty).toHaveBeenCalledWith(
            'No active highlights.\nClick a virtual link to highlight text here.'
        );
    });

    it('falls back to the active file when the recent markdown leaf is unavailable', async () => {
        const hs = new HighlightService();
        activateHighlight(hs, 'Notes/Fallback.md', 'second');

        const otherView = makeMarkdownView('Notes/Other.md');
        const fallbackView = makeMarkdownView('Notes/Fallback.md');
        const highlightView = makeHighlightView({
            hs,
            recentView: null,
            activeFile: fallbackView.file,
            leaves: [otherView, fallbackView],
        });

        await highlightView.refresh();

        expect(highlightView.app.vault.cachedRead).toHaveBeenCalledWith(fallbackView.file);
        expect(highlightView.renderOccurrences).toHaveBeenCalledWith(
            fallbackView,
            'Fallback',
            'second',
            expect.any(Array)
        );
    });
});

describe('HighlightView.navigateTo', () => {
    const OriginalHTMLElement = globalThis.HTMLElement;

    class FakeHTMLElement {
        scrollIntoView = jest.fn();
    }

    beforeAll(() => {
        Object.defineProperty(globalThis, 'HTMLElement', {
            value: FakeHTMLElement,
            configurable: true,
        });
    });

    afterAll(() => {
        if (OriginalHTMLElement) {
            Object.defineProperty(globalThis, 'HTMLElement', {
                value: OriginalHTMLElement,
                configurable: true,
            });
        } else {
            delete (globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement;
        }
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('jumps preview mode near the source line, then scrolls the rendered mark by source-line metadata', () => {
        jest.useFakeTimers();

        const highlightView = new HighlightView({} as any, new HighlightService()) as any;
        const setActiveLeaf = jest.fn();
        highlightView.app = { workspace: { setActiveLeaf } };

        const target = new FakeHTMLElement();
        let rendered = false;

        const view = {
            getMode: jest.fn(() => 'preview'),
            getEphemeralState: jest.fn(() => ({ scroll: 42 })),
            setEphemeralState: jest.fn(() => {
                rendered = true;
            }),
            contentEl: {
                querySelector: jest.fn((selector: string) => {
                    if (rendered && selector === 'mark.autolink-highlight[data-autolink-source-line="12"]') {
                        return target;
                    }
                    return null;
                }),
                querySelectorAll: jest.fn(() => []),
            },
            leaf: {},
        };

        highlightView.navigateTo(view as any, {
            index: 3,
            line: 12,
            ch: 5,
            matchText: 'alpha',
            rawLine: 'alpha row',
        });

        expect(view.setEphemeralState).toHaveBeenCalledWith({ scroll: 42, line: 12 });
        expect(setActiveLeaf).toHaveBeenCalledWith(view.leaf, { focus: true });

        jest.runOnlyPendingTimers();

        expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    });

    it('falls back to the nth rendered mark when source-line metadata is unavailable', () => {
        const highlightView = new HighlightView({} as any, new HighlightService()) as any;
        highlightView.app = { workspace: { setActiveLeaf: jest.fn() } };

        const first = new FakeHTMLElement();
        const target = new FakeHTMLElement();

        const view = {
            getMode: jest.fn(() => 'preview'),
            getEphemeralState: jest.fn(() => ({})),
            setEphemeralState: jest.fn(),
            contentEl: {
                querySelector: jest.fn(() => null),
                querySelectorAll: jest.fn(() => [first, target]),
            },
            leaf: {},
        };

        highlightView.navigateTo(view as any, {
            index: 1,
            line: 8,
            ch: 2,
            matchText: 'beta',
            rawLine: 'beta row',
        });

        expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
        expect(view.setEphemeralState).not.toHaveBeenCalled();
    });
});

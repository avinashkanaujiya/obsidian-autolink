import { MarkdownView, TFile } from 'obsidian';
import { ActiveHighlightEntry, HighlightService } from '../linker/highlightService';
import { HighlightView } from '../linker/highlightView';

function activateHighlight(hs: HighlightService, filePath: string, searchText: string): void {
    hs.setPending(filePath, searchText);
    hs.activateForFile(filePath);
}

function makeMarkdownFile(path: string): TFile {
    const file = Object.create(TFile.prototype) as TFile;
    const base = path.split('/').pop() ?? path;
    file.path = path;
    file.basename = base.replace(/\.md$/, '');
    file.extension = 'md';
    file.stat = { mtime: 1000, ctime: 1000, size: 0 };
    file.parent = null;
    return file;
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
    fileContents?: Record<string, string>;
}) {
    const view = new HighlightView({} as any, params.hs) as any;

    view.contentEl = {
        empty: jest.fn(),
        createDiv: jest.fn(() => ({
            createEl: jest.fn(() => ({ setText: jest.fn() })),
            setText: jest.fn(),
        })),
        createEl: jest.fn(() => ({ setText: jest.fn() })),
    };
    view.renderFileGroup = jest.fn();
    view.renderEmpty = jest.fn();

    const filesByPath = new Map<string, TFile>();
    for (const leafView of params.leaves) {
        filesByPath.set(leafView.file.path, leafView.file);
    }
    if (params.activeFile) {
        filesByPath.set(params.activeFile.path, params.activeFile);
    }

    view.app = {
        workspace: {
            getMostRecentLeaf: jest.fn(() => (params.recentView ? { view: params.recentView } : null)),
            getActiveFile: jest.fn(() => params.activeFile ?? params.recentView?.file ?? null),
            getLeavesOfType: jest.fn(() => params.leaves.map((leafView) => ({ view: leafView }))),
        },
        vault: {
            cachedRead: jest.fn(async (file: TFile) => {
                if (params.fileContents && file.path in params.fileContents) {
                    return params.fileContents[file.path];
                }
                return 'alpha\nsecond\nbeta';
            }),
            getAbstractFileByPath: jest.fn((path: string) => filesByPath.get(path) ?? null),
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
    it('renders all active highlight groups when multiple files are highlighted', async () => {
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

        expect(highlightView.renderEmpty).not.toHaveBeenCalled();
        expect(highlightView.renderFileGroup).toHaveBeenCalledTimes(2);

        const calls = highlightView.renderFileGroup.mock.calls as Array<[any]>;
        const basenames = calls.map((c) => c[0].fileName);
        expect(basenames).toContain('First');
        expect(basenames).toContain('Second');
    });

    it('shows an empty state when no highlights are active', async () => {
        const hs = new HighlightService();

        const firstView = makeMarkdownView('Notes/First.md');
        const highlightView = makeHighlightView({
            hs,
            recentView: firstView,
            leaves: [firstView],
        });

        await highlightView.refresh();

        expect(highlightView.app.vault.cachedRead).not.toHaveBeenCalled();
        expect(highlightView.renderFileGroup).not.toHaveBeenCalled();
        expect(highlightView.renderEmpty).toHaveBeenCalledWith(
            'No active highlights.\nClick a virtual link to highlight text here.'
        );
    });

    it('skips re-render when the active highlight set has not changed', async () => {
        const hs = new HighlightService();
        activateHighlight(hs, 'Notes/First.md', 'alpha');

        const firstView = makeMarkdownView('Notes/First.md');
        const highlightView = makeHighlightView({
            hs,
            recentView: firstView,
            leaves: [firstView],
        });

        await highlightView.refresh();
        expect(highlightView.renderFileGroup).toHaveBeenCalledTimes(1);

        // Second call with identical state should skip render
        await highlightView.refresh();
        expect(highlightView.renderFileGroup).toHaveBeenCalledTimes(1);
    });

    it('re-renders when a new highlight is activated', async () => {
        const hs = new HighlightService();
        activateHighlight(hs, 'Notes/First.md', 'alpha');

        const firstView = makeMarkdownView('Notes/First.md');
        const secondView = makeMarkdownView('Notes/Second.md');
        const highlightView = makeHighlightView({
            hs,
            recentView: firstView,
            leaves: [firstView, secondView],
        });

        await highlightView.refresh();
        expect(highlightView.renderFileGroup).toHaveBeenCalledTimes(1);

        // Activate a second file — hash changes, so it should re-render
        activateHighlight(hs, 'Notes/Second.md', 'beta');
        await highlightView.refresh();
        expect(highlightView.renderFileGroup).toHaveBeenCalledTimes(3); // 1st + 2 files
    });

    it('clears a file group when its highlight is removed via clearStale', async () => {
        const hs = new HighlightService();
        activateHighlight(hs, 'Notes/First.md', 'alpha');
        activateHighlight(hs, 'Notes/Second.md', 'beta');

        const firstView = makeMarkdownView('Notes/First.md');
        const secondView = makeMarkdownView('Notes/Second.md');
        const highlightView = makeHighlightView({
            hs,
            recentView: firstView,
            leaves: [firstView, secondView],
        });

        await highlightView.refresh();
        expect(highlightView.renderFileGroup).toHaveBeenCalledTimes(2);

        // Simulate closing the second file
        hs.clearStale(new Set(['Notes/First.md']));
        await highlightView.refresh();
        expect(highlightView.renderFileGroup).toHaveBeenCalledTimes(3); // 2 + 1 remaining
    });
});

describe('HighlightView.computeHash', () => {
    it('produces the same hash regardless of entry order', () => {
        const view = new HighlightView({} as any, new HighlightService()) as any;

        const entriesA: ActiveHighlightEntry[] = [
            { filePath: 'A.md', searchText: 'alpha', activatedAt: 100 },
            { filePath: 'B.md', searchText: 'beta', activatedAt: 200 },
        ];
        const entriesB: ActiveHighlightEntry[] = [
            { filePath: 'B.md', searchText: 'beta', activatedAt: 200 },
            { filePath: 'A.md', searchText: 'alpha', activatedAt: 100 },
        ];

        expect(view.computeHash(entriesA)).toBe(view.computeHash(entriesB));
    });

    it('produces a different hash when search text changes', () => {
        const view = new HighlightView({} as any, new HighlightService()) as any;

        const entriesA: ActiveHighlightEntry[] = [
            { filePath: 'A.md', searchText: 'alpha', activatedAt: 100 },
        ];
        const entriesB: ActiveHighlightEntry[] = [
            { filePath: 'A.md', searchText: 'beta', activatedAt: 100 },
        ];

        expect(view.computeHash(entriesA)).not.toBe(view.computeHash(entriesB));
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

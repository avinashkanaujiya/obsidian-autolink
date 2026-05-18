import { MarkdownView, TFile } from 'obsidian';
import { collectVirtualLinkSyntaxClasses, resolveMarkdownViewForEditorDOM } from '../linker/liveLinker';

function makeFile(path: string): TFile {
    const base = path.split('/').pop() ?? path;
    return {
        path,
        basename: base.replace(/\.md$/, ''),
        extension: 'md',
        stat: { mtime: 1000, ctime: 1000, size: 0 },
        parent: null,
    } as unknown as TFile;
}

function makeMarkdownView(path: string, contentEl: { parentNode: unknown }): MarkdownView & { file: TFile; contentEl: { parentNode: unknown } } {
    const view = Object.create(MarkdownView.prototype) as MarkdownView & {
        file: TFile;
        contentEl: { parentNode: unknown };
    };
    view.file = makeFile(path);
    (view as any).contentEl = contentEl;
    return view;
}

describe('collectVirtualLinkSyntaxClasses', () => {
    it('returns an empty list when domAtPos throws during a transient editor update', () => {
        const view = {
            domAtPos: jest.fn(() => {
                throw new Error('transient dom state');
            }),
        };

        expect(collectVirtualLinkSyntaxClasses(view as never, 10, 14)).toEqual([]);
        expect(view.domAtPos).toHaveBeenCalledTimes(2);
    });
});

describe('resolveMarkdownViewForEditorDOM', () => {
    function makeNestedDescendant(parentNode: { parentNode: unknown }, depth: number): { parentNode: unknown } {
        let current: { parentNode: unknown } = { parentNode };
        for (let i = 1; i < depth; i++) {
            current = { parentNode: current };
        }
        return current;
    }

    it('returns the markdown view that owns the editor DOM, not the active file', () => {
        const activeContentEl = { parentNode: null };
        const targetContentEl = { parentNode: null };
        const targetEditorDom = { parentNode: targetContentEl };

        const activeView = makeMarkdownView('Notes/Active.md', activeContentEl);
        const targetView = makeMarkdownView('Notes/Target.md', targetContentEl);

        const app = {
            workspace: {
                iterateAllLeaves: (cb: (leaf: { view: MarkdownView }) => void) => {
                    cb({ view: activeView });
                    cb({ view: targetView });
                },
            },
        };

        expect(resolveMarkdownViewForEditorDOM(app as never, targetEditorDom as never)).toBe(targetView);
    });

    it('handles deeply nested editor DOM trees', () => {
        const targetContentEl = { parentNode: null };
        const targetEditorDom = makeNestedDescendant(targetContentEl, 20);
        const targetView = makeMarkdownView('Notes/Deep.md', targetContentEl);

        const app = {
            workspace: {
                iterateAllLeaves: (cb: (leaf: { view: MarkdownView }) => void) => {
                    cb({ view: targetView });
                },
            },
        };

        expect(resolveMarkdownViewForEditorDOM(app as never, targetEditorDom as never)).toBe(targetView);
    });
});

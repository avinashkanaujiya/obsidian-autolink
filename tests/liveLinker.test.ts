import { MarkdownView, TFile } from 'obsidian';
import { resolveMarkdownViewForEditorDOM } from '../linker/liveLinker';

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

describe('resolveMarkdownViewForEditorDOM', () => {
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
});

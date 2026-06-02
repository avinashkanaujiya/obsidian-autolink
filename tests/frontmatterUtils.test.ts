import { removeTermFromFrontmatter } from '../linker/frontmatterUtils';

// Mock Obsidian's Notice
jest.mock('obsidian', () => {
    const actual = jest.requireActual('./__mocks__/obsidian');
    return {
        ...actual,
        Notice: jest.fn(),
    };
});

import { Notice, TFile } from 'obsidian';

function createMockApp(frontmatter: Record<string, unknown> = {}) {
    const fm = { ...frontmatter };
    return {
        vault: {
            getAbstractFileByPath: (path: string) => {
                const file = Object.create(TFile.prototype) as TFile;
                file.path = path;
                file.basename = path.split('/').pop()?.replace(/\.md$/, '') ?? path;
                return file;
            },
        },
        fileManager: {
            processFrontMatter: jest.fn(async (_file: TFile, fn: (fm: Record<string, unknown>) => void) => {
                fn(fm);
            }),
        },
        metadataCache: {
            getFileCache: () => ({ frontmatter: fm }),
        },
        _fm: fm, // expose for assertions
    } as any;
}

function createMockUpdateManager() {
    return { update: jest.fn() };
}

describe('removeTermFromFrontmatter', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('removes term from aliases', async () => {
        const app = createMockApp({ aliases: ['AI', 'ML', 'Deep Learning'] });
        const settings = { customFrontmatterFields: [] } as any;
        const updateManager = createMockUpdateManager();

        const result = await removeTermFromFrontmatter(app, settings, updateManager, 'test.md', 'AI');

        expect(result).toBe(true);
        expect(app._fm.aliases).toEqual(['ML', 'Deep Learning']);
        expect(updateManager.update).toHaveBeenCalled();
        expect(Notice).toHaveBeenCalledWith(expect.stringContaining('Removed "AI"'));
    });

    it('removes term from custom frontmatter field', async () => {
        const app = createMockApp({ keywords: ['neural', 'cortex'] });
        const settings = { customFrontmatterFields: ['keywords'] } as any;
        const updateManager = createMockUpdateManager();

        const result = await removeTermFromFrontmatter(app, settings, updateManager, 'test.md', 'neural');

        expect(result).toBe(true);
        expect(app._fm.keywords).toEqual(['cortex']);
    });

    it('removes term from both aliases and custom fields', async () => {
        const app = createMockApp({ aliases: ['AI'], keywords: ['AI', 'ML'] });
        const settings = { customFrontmatterFields: ['keywords'] } as any;
        const updateManager = createMockUpdateManager();

        const result = await removeTermFromFrontmatter(app, settings, updateManager, 'test.md', 'AI');

        expect(result).toBe(true);
        // aliases should be removed entirely since it became empty
        expect(app._fm.aliases).toBeUndefined();
        expect(app._fm.keywords).toEqual(['ML']);
    });

    it('removes field entirely when last entry is removed', async () => {
        const app = createMockApp({ aliases: ['AI'] });
        const settings = { customFrontmatterFields: [] } as any;
        const updateManager = createMockUpdateManager();

        const result = await removeTermFromFrontmatter(app, settings, updateManager, 'test.md', 'AI');

        expect(result).toBe(true);
        expect(app._fm.aliases).toBeUndefined();
    });

    it('returns false when term is not found', async () => {
        const app = createMockApp({ aliases: ['ML'] });
        const settings = { customFrontmatterFields: [] } as any;
        const updateManager = createMockUpdateManager();

        const result = await removeTermFromFrontmatter(app, settings, updateManager, 'test.md', 'AI');

        expect(result).toBe(false);
        expect(updateManager.update).not.toHaveBeenCalled();
    });

    it('handles case-insensitive matching', async () => {
        const app = createMockApp({ aliases: ['AI', 'ml'] });
        const settings = { customFrontmatterFields: [] } as any;
        const updateManager = createMockUpdateManager();

        const result = await removeTermFromFrontmatter(app, settings, updateManager, 'test.md', 'ai');

        expect(result).toBe(true);
        expect(app._fm.aliases).toEqual(['ml']);
    });

    it('handles missing file gracefully', async () => {
        const app = {
            vault: {
                getAbstractFileByPath: () => null,
            },
            fileManager: {
                processFrontMatter: jest.fn(),
            },
        } as any;
        const settings = { customFrontmatterFields: [] } as any;
        const updateManager = createMockUpdateManager();

        const result = await removeTermFromFrontmatter(app, settings, updateManager, 'missing.md', 'AI');

        expect(result).toBe(false);
        expect(Notice).toHaveBeenCalledWith(expect.stringContaining('File not found'));
        expect(updateManager.update).not.toHaveBeenCalled();
    });
});

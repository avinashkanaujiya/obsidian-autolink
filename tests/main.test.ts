import LinkerPlugin, {
    buildRelativeVaultPath,
    handleVirtualLinkClickEvent,
    LinkerPluginSettings,
    normalizeFrontmatterTags,
} from 'main';
import { TFile } from 'obsidian';

const BASE_SETTINGS: LinkerPluginSettings = {
    advancedSettings: false,
    linkerActivated: true,
    suppressSuffixForSubWords: false,
    matchAnyPartsOfWords: false,
    matchEndOfWords: true,
    matchBeginningOfWords: true,
    includeAllFiles: true,
    linkerDirectories: ['Glossary'],
    excludedDirectories: [],
    excludedDirectoriesForLinking: [],
    virtualLinkSuffix: '🔗',
    virtualLinkAliasSuffix: '🔗',
    defaultUseMarkdownLinks: false,
    defaultLinkFormat: 'shortest',
    useMarkdownLinks: false,
    linkFormat: 'shortest',
    useDefaultLinkStyleForConversion: true,
    applyDefaultLinkStyling: true,
    includeHeaders: true,
    matchCaseSensitive: false,
    capitalLetterProportionForAutomaticMatchCase: 0.75,
    tagToIgnoreCase: 'linker-ignore-case',
    tagToMatchCase: 'linker-match-case',
    propertyNameToMatchCase: 'linker-match-case',
    propertyNameToIgnoreCase: 'linker-ignore-case',
    tagToExcludeFile: 'linker-exclude',
    tagToIncludeFile: 'linker-include',
    excludeLinksToOwnNote: true,
    fixIMEProblem: false,
    excludeLinksInCurrentLine: false,
    onlyLinkOnce: true,
    excludeLinksToRealLinkedFiles: true,
    includeAliases: true,
    customFrontmatterFields: [],
    alwaysShowMultipleReferences: false,
};

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

describe('buildRelativeVaultPath', () => {
    it('returns the target basename for files in the same folder', () => {
        expect(buildRelativeVaultPath('Notes/Source.md', 'Notes/Target.md')).toBe('Target.md');
    });

    it('returns a child-path for files in a nested folder', () => {
        expect(buildRelativeVaultPath('Notes/Source.md', 'Notes/Topic/Target.md')).toBe('Topic/Target.md');
    });

    it('returns a parent-relative path when the target is higher in the tree', () => {
        expect(buildRelativeVaultPath('Notes/Topic/Source.md', 'Notes/Target.md')).toBe('../Target.md');
    });
});

describe('normalizeFrontmatterTags', () => {
    it('normalizes a single tag string', () => {
        expect(normalizeFrontmatterTags(' linker-include ')).toEqual(['linker-include']);
    });

    it('filters non-string and empty array entries', () => {
        expect(normalizeFrontmatterTags([' linker-exclude ', '', 42, null, 'linker-include'])).toEqual([
            'linker-exclude',
            'linker-include',
        ]);
    });

    it('returns an empty array for unsupported values', () => {
        expect(normalizeFrontmatterTags(undefined)).toEqual([]);
        expect(normalizeFrontmatterTags({})).toEqual([]);
    });
});

describe('LinkerPlugin.buildRealLink', () => {
    it('builds a relative wikilink without a leading slash for same-folder files', () => {
        const plugin = Object.create(LinkerPlugin.prototype) as {
            app: {
                metadataCache: {
                    fileToLinktext: (file: TFile, sourcePath: string) => string;
                    getFirstLinkpathDest: (path: string, sourcePath: string) => TFile | null;
                };
            };
            settings: LinkerPluginSettings;
            buildRealLink: (targetFile: TFile, sourceFilePath: string, displayText: string) => string;
        };

        plugin.app = {
            metadataCache: {
                fileToLinktext: () => 'Target',
                getFirstLinkpathDest: () => null,
            },
        };
        plugin.settings = {
            ...BASE_SETTINGS,
            useDefaultLinkStyleForConversion: false,
            useMarkdownLinks: false,
            linkFormat: 'relative',
        };

        const targetFile = makeFile('Notes/Target.md');
        expect(plugin.buildRealLink(targetFile, 'Notes/Source.md', 'Shown text')).toBe('[[Target|Shown text]]');
    });
});

describe('handleVirtualLinkClickEvent', () => {
    it('opens the clicked virtual link explicitly and stores the pending highlight', async () => {
        const app = {
            workspace: {
                getActiveFile: () => makeFile('Notes/Source.md'),
                openLinkText: jest.fn(async () => undefined),
            },
        };
        const highlightService = {
            setPending: jest.fn(),
        };

        const anchor = {
            getAttribute: (name: string) => {
                if (name === 'href') return 'Notes/Target.md';
                if (name === 'origin-text') return 'Target';
                return null;
            },
        };

        const event = {
            button: 0,
            target: {
                closest: (selector: string) => selector === '.virtual-link-a' ? anchor : null,
            },
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
        } as unknown as MouseEvent;

        await handleVirtualLinkClickEvent(app as any, highlightService as any, event);

        expect(highlightService.setPending).toHaveBeenCalledWith('Notes/Target.md', 'Target');
        expect(app.workspace.openLinkText).toHaveBeenCalledWith('Notes/Target.md', 'Notes/Source.md', false);
        expect(event.preventDefault).toHaveBeenCalled();
        expect(event.stopPropagation).toHaveBeenCalled();
    });

    it('falls back to the primary anchor when clicking the decorated widget around it', async () => {
        const app = {
            workspace: {
                getActiveFile: () => makeFile('Notes/Source.md'),
                openLinkText: jest.fn(async () => undefined),
            },
        };
        const highlightService = {
            setPending: jest.fn(),
        };

        const anchor = {
            getAttribute: (name: string) => {
                if (name === 'href') return 'Notes/Target.md';
                if (name === 'origin-text') return 'Target';
                return null;
            },
        };
        const widget = {
            querySelector: (selector: string) => selector === '.virtual-link-a' ? anchor : null,
        };

        const event = {
            button: 0,
            target: {
                closest: (selector: string) => {
                    if (selector === '.virtual-link-a') return null;
                    if (selector === '.virtual-link-span') return widget;
                    return null;
                },
            },
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
        } as unknown as MouseEvent;

        await handleVirtualLinkClickEvent(app as any, highlightService as any, event);

        expect(highlightService.setPending).toHaveBeenCalledWith('Notes/Target.md', 'Target');
        expect(app.workspace.openLinkText).toHaveBeenCalledWith('Notes/Target.md', 'Notes/Source.md', false);
    });

    it('opens all candidate files in new tabs when clicking the open-all action', async () => {
        jest.useFakeTimers();

        try {
            const app = {
                workspace: {
                    getActiveFile: () => makeFile('Notes/Source.md'),
                    openLinkText: jest.fn(async () => undefined),
                },
            };
            const highlightService = {
                setPending: jest.fn(),
            };

            const openAllAnchor = {
                getAttribute: (name: string) => {
                    if (name === 'href') return 'Notes/First.md';
                    if (name === 'origin-text') return 'Target';
                    if (name === 'data-open-all-paths') {
                        return JSON.stringify([
                            'Notes/First.md',
                            'Notes/Second.md',
                            'Notes/Third.md',
                        ]);
                    }
                    return null;
                },
            };

            const event = {
                button: 0,
                target: {
                    closest: (selector: string) => selector === '.virtual-link-open-all' ? openAllAnchor : null,
                },
                preventDefault: jest.fn(),
                stopPropagation: jest.fn(),
            } as unknown as MouseEvent;

            const clickPromise = handleVirtualLinkClickEvent(app as any, highlightService as any, event);

            await Promise.resolve();

            expect(highlightService.setPending).toHaveBeenNthCalledWith(1, 'Notes/First.md', 'Target');
            expect(highlightService.setPending).toHaveBeenNthCalledWith(2, 'Notes/Second.md', 'Target');
            expect(highlightService.setPending).toHaveBeenNthCalledWith(3, 'Notes/Third.md', 'Target');
            expect(app.workspace.openLinkText).toHaveBeenNthCalledWith(1, 'Notes/First.md', 'Notes/Source.md', 'tab');

            await jest.advanceTimersByTimeAsync(400);
            await clickPromise;

            expect(app.workspace.openLinkText).toHaveBeenNthCalledWith(2, 'Notes/Second.md', 'Notes/Source.md', 'tab');
            expect(app.workspace.openLinkText).toHaveBeenNthCalledWith(3, 'Notes/Third.md', 'Notes/Source.md', 'tab');
            expect(app.workspace.openLinkText).toHaveBeenCalledTimes(3);
            expect(event.preventDefault).toHaveBeenCalled();
            expect(event.stopPropagation).toHaveBeenCalled();
        } finally {
            jest.useRealTimers();
        }
    });

    it('ignores non-left mouse buttons', async () => {
        const app = {
            workspace: {
                getActiveFile: () => makeFile('Notes/Source.md'),
                openLinkText: jest.fn(async () => undefined),
            },
        };
        const highlightService = {
            setPending: jest.fn(),
        };

        const anchor = {
            getAttribute: (name: string) => {
                if (name === 'href') return 'Notes/Target.md';
                if (name === 'origin-text') return 'Target';
                return null;
            },
        };

        const event = {
            button: 2,
            target: {
                closest: (selector: string) => selector === '.virtual-link-a' ? anchor : null,
            },
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
        } as unknown as MouseEvent;

        await handleVirtualLinkClickEvent(app as any, highlightService as any, event);

        expect(highlightService.setPending).not.toHaveBeenCalled();
        expect(app.workspace.openLinkText).not.toHaveBeenCalled();
        expect(event.preventDefault).not.toHaveBeenCalled();
    });
});

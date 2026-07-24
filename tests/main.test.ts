import LinkerPlugin, {
    buildRelativeVaultPath,
    handleVirtualLinkClickEvent,
    handleVirtualLinkHoverEnterEvent,
    handleVirtualLinkHoverLeaveEvent,
    LinkerPluginSettings,
    normalizeFrontmatterTags,
    registerInitialMetadataCacheRefresh,
    VIRTUAL_LINK_HOVER_DELAY_MS,
} from 'main';
import { TFile } from 'obsidian';
import { LinkerCache } from '../linker/linkerCache';

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
    requireModifierForCandidateLinks: false,
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

function makeHoverRoot() {
    const classes = new Set<string>();
    const root = {
        classList: {
            add: (token: string) => {
                classes.add(token);
            },
            remove: (token: string) => {
                classes.delete(token);
            },
            contains: (token: string) => classes.has(token),
        },
        closest: (selector: string) => selector === '.virtual-link-span' ? root : null,
    };

    return { root, classes };
}

function makeHoverTarget(root: { closest: (selector: string) => unknown }) {
    return {
        closest: (selector: string) => selector === '.virtual-link-span' ? root : null,
    };
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
    function makePlugin() {
        return Object.create(LinkerPlugin.prototype) as {
            app: {
                metadataCache: {
                    fileToLinktext: (file: TFile, sourcePath: string) => string;
                    getFirstLinkpathDest: (path: string, sourcePath: string) => TFile | null;
                };
            };
            settings: LinkerPluginSettings;
            buildRealLink: (targetFile: TFile, sourceFilePath: string, displayText: string) => string;
        };
    }

    it('builds a relative wikilink without a leading slash for same-folder files', () => {
        const plugin = makePlugin();

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

    it('respects markdown-link conversion when display text matches the shortest path', () => {
        const plugin = makePlugin();
        const targetFile = makeFile('Notes/Target.md');

        plugin.app = {
            metadataCache: {
                fileToLinktext: () => 'Target',
                getFirstLinkpathDest: () => targetFile,
            },
        };
        plugin.settings = {
            ...BASE_SETTINGS,
            useDefaultLinkStyleForConversion: false,
            useMarkdownLinks: true,
            linkFormat: 'shortest',
        };

        expect(plugin.buildRealLink(targetFile, 'Notes/Source.md', 'Target')).toBe('[Target](Target)');
    });
});

describe('registerInitialMetadataCacheRefresh', () => {
    it('schedules a full refresh immediately when metadata is already initialized', () => {
        const scheduleFullRefresh = jest.fn();
        const registerEvent = jest.fn();
        const metadataCache = {
            initialized: true,
            on: jest.fn((_name: 'resolved', callback: () => void) => callback),
        };

        registerInitialMetadataCacheRefresh(metadataCache, registerEvent, scheduleFullRefresh);

        expect(metadataCache.on).toHaveBeenCalledWith('resolved', expect.any(Function));
        expect(registerEvent).toHaveBeenCalledWith(expect.any(Function));
        expect(scheduleFullRefresh).toHaveBeenCalledTimes(1);
    });

    it('waits for the first resolved event when metadata is not initialized yet', () => {
        const scheduleFullRefresh = jest.fn();
        const registerEvent = jest.fn();
        let resolvedCallback: (() => void) | undefined;
        const metadataCache = {
            initialized: false,
            on: jest.fn((_name: 'resolved', callback: () => void) => {
                resolvedCallback = callback;
                return callback;
            }),
        };

        registerInitialMetadataCacheRefresh(metadataCache, registerEvent, scheduleFullRefresh);

        expect(scheduleFullRefresh).not.toHaveBeenCalled();
        expect(resolvedCallback).toBeDefined();

        resolvedCallback?.();
        resolvedCallback?.();

        expect(scheduleFullRefresh).toHaveBeenCalledTimes(1);
    });
});

describe('LinkerPlugin.scheduleCacheRefresh', () => {
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    function makePlugin() {
        const plugin = Object.create(LinkerPlugin.prototype) as {
            app: unknown;
            settings: LinkerPluginSettings;
            updateManager: { update: jest.Mock };
            rerenderReadingViews: jest.Mock;
            cacheRefreshTimer: ReturnType<typeof setTimeout> | null;
            pendingCacheRefreshPaths: Set<string>;
            forceFullCacheRefresh: boolean;
            scheduleCacheRefresh: (filePaths?: string[]) => void;
        };

        plugin.app = {};
        plugin.settings = { ...BASE_SETTINGS };
        plugin.updateManager = { update: jest.fn() };
        plugin.rerenderReadingViews = jest.fn();
        plugin.cacheRefreshTimer = null;
        plugin.pendingCacheRefreshPaths = new Set<string>();
        plugin.forceFullCacheRefresh = false;
        return plugin;
    }

    it('updates only the changed files when specific paths are provided', () => {
        jest.useFakeTimers();

        const plugin = makePlugin();
        const rebuildCache = jest.fn();
        const updateFiles = jest.fn();
        jest.spyOn(LinkerCache, 'getInstance').mockReturnValue({
            rebuildCache,
            updateFiles,
            isCacheDirty: jest.fn().mockReturnValue(true),
            clearCacheDirty: jest.fn(),
        } as unknown as LinkerCache);

        plugin.scheduleCacheRefresh(['Notes/Alpha.md', 'Notes/Beta.md']);
        jest.runOnlyPendingTimers();

        expect(updateFiles).toHaveBeenCalledWith(['Notes/Alpha.md', 'Notes/Beta.md']);
        expect(rebuildCache).not.toHaveBeenCalled();
        expect(plugin.rerenderReadingViews).toHaveBeenCalled();
        expect(plugin.updateManager.update).toHaveBeenCalled();
    });

    it('prefers a full rebuild when a later refresh request requires it', () => {
        jest.useFakeTimers();

        const plugin = makePlugin();
        const rebuildCache = jest.fn();
        const updateFiles = jest.fn();
        jest.spyOn(LinkerCache, 'getInstance').mockReturnValue({
            rebuildCache,
            updateFiles,
            isCacheDirty: jest.fn().mockReturnValue(true),
            clearCacheDirty: jest.fn(),
        } as unknown as LinkerCache);

        plugin.scheduleCacheRefresh(['Notes/Alpha.md']);
        plugin.scheduleCacheRefresh();
        jest.runOnlyPendingTimers();

        expect(rebuildCache).toHaveBeenCalledTimes(1);
        expect(updateFiles).not.toHaveBeenCalled();
    });
});

describe('handleVirtualLink hover activation', () => {
    it('activates hover styling only after the delay', () => {
        jest.useFakeTimers();

        try {
            const { root, classes } = makeHoverRoot();
            const event = {
                target: makeHoverTarget(root),
                relatedTarget: null,
            } as unknown as MouseEvent;

            handleVirtualLinkHoverEnterEvent(false, event);
            expect(classes.has('virtual-link-hover-active')).toBe(false);

            jest.advanceTimersByTime(VIRTUAL_LINK_HOVER_DELAY_MS - 1);
            expect(classes.has('virtual-link-hover-active')).toBe(false);

            jest.advanceTimersByTime(1);
            expect(classes.has('virtual-link-hover-active')).toBe(true);
        } finally {
            jest.useRealTimers();
        }
    });

    it('cancels the pending hover styling when the pointer leaves quickly', () => {
        jest.useFakeTimers();

        try {
            const { root, classes } = makeHoverRoot();
            const target = makeHoverTarget(root);

            handleVirtualLinkHoverEnterEvent(false, { target, relatedTarget: null } as unknown as MouseEvent);
            handleVirtualLinkHoverLeaveEvent({ target, relatedTarget: null } as unknown as MouseEvent);

            jest.advanceTimersByTime(VIRTUAL_LINK_HOVER_DELAY_MS);
            expect(classes.has('virtual-link-hover-active')).toBe(false);
        } finally {
            jest.useRealTimers();
        }
    });

    it('keeps hover styling active while moving between descendants of the same virtual link', () => {
        jest.useFakeTimers();

        try {
            const { root, classes } = makeHoverRoot();
            const firstTarget = makeHoverTarget(root);
            const secondTarget = makeHoverTarget(root);

            handleVirtualLinkHoverEnterEvent(false, { target: firstTarget, relatedTarget: null } as unknown as MouseEvent);
            jest.advanceTimersByTime(VIRTUAL_LINK_HOVER_DELAY_MS);
            expect(classes.has('virtual-link-hover-active')).toBe(true);

            handleVirtualLinkHoverLeaveEvent({
                target: firstTarget,
                relatedTarget: secondTarget,
            } as unknown as MouseEvent);

            expect(classes.has('virtual-link-hover-active')).toBe(true);
        } finally {
            jest.useRealTimers();
        }
    });

    it('does not activate hover styling when the modifier gate is on and no modifier is held', () => {
        jest.useFakeTimers();

        try {
            const { root, classes } = makeHoverRoot();
            const event = {
                target: makeHoverTarget(root),
                relatedTarget: null,
                metaKey: false,
                ctrlKey: false,
                stopPropagation: jest.fn(),
            } as unknown as MouseEvent;

            handleVirtualLinkHoverEnterEvent(true, event);
            jest.advanceTimersByTime(VIRTUAL_LINK_HOVER_DELAY_MS);

            expect(classes.has('virtual-link-hover-active')).toBe(false);
        } finally {
            jest.useRealTimers();
        }
    });

    it('activates hover styling when the modifier gate is on and the modifier is held', () => {
        jest.useFakeTimers();

        try {
            const { root, classes } = makeHoverRoot();
            const event = {
                target: makeHoverTarget(root),
                relatedTarget: null,
                metaKey: true,
                ctrlKey: false,
            } as unknown as MouseEvent;

            handleVirtualLinkHoverEnterEvent(true, event);
            jest.advanceTimersByTime(VIRTUAL_LINK_HOVER_DELAY_MS);

            expect(classes.has('virtual-link-hover-active')).toBe(true);
        } finally {
            jest.useRealTimers();
        }
    });

    it('keeps the legacy standalone hover behaviour when the modifier gate is off', () => {
        jest.useFakeTimers();

        try {
            const { root, classes } = makeHoverRoot();
            const event = {
                target: makeHoverTarget(root),
                relatedTarget: null,
                metaKey: false,
                ctrlKey: false,
            } as unknown as MouseEvent;

            handleVirtualLinkHoverEnterEvent(false, event);
            jest.advanceTimersByTime(VIRTUAL_LINK_HOVER_DELAY_MS);

            expect(classes.has('virtual-link-hover-active')).toBe(true);
        } finally {
            jest.useRealTimers();
        }
    });

    it('stops mouseover propagation when the modifier gate is on and no modifier is held', () => {
        jest.useFakeTimers();

        try {
            const { root, classes } = makeHoverRoot();
            const event = {
                target: makeHoverTarget(root),
                relatedTarget: null,
                metaKey: false,
                ctrlKey: false,
                stopPropagation: jest.fn(),
            } as unknown as MouseEvent;

            handleVirtualLinkHoverEnterEvent(true, event);
            jest.advanceTimersByTime(VIRTUAL_LINK_HOVER_DELAY_MS);

            expect((event as unknown as { stopPropagation: jest.Mock }).stopPropagation).toHaveBeenCalled();
            // No class added because the handler returned early after stopPropagation.
            expect(classes.has('virtual-link-hover-active')).toBe(false);
        } finally {
            jest.useRealTimers();
        }
    });

    it('does not stop mouseover when the modifier gate is on and the modifier is held', () => {
        jest.useFakeTimers();

        try {
            const { root, classes } = makeHoverRoot();
            const event = {
                target: makeHoverTarget(root),
                relatedTarget: null,
                metaKey: true,
                ctrlKey: false,
                stopPropagation: jest.fn(),
            } as unknown as MouseEvent;

            handleVirtualLinkHoverEnterEvent(true, event);
            jest.advanceTimersByTime(VIRTUAL_LINK_HOVER_DELAY_MS);

            expect((event as unknown as { stopPropagation: jest.Mock }).stopPropagation).not.toHaveBeenCalled();
            expect(classes.has('virtual-link-hover-active')).toBe(true);
        } finally {
            jest.useRealTimers();
        }
    });

    it('does not stop mouseover for non-candidate-link targets', () => {
        const event = {
            target: { closest: () => null },
            relatedTarget: null,
            metaKey: false,
            ctrlKey: false,
            stopPropagation: jest.fn(),
        } as unknown as MouseEvent;

        handleVirtualLinkHoverEnterEvent(true, event);

        expect((event as unknown as { stopPropagation: jest.Mock }).stopPropagation).not.toHaveBeenCalled();
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

        await handleVirtualLinkClickEvent(app as any, highlightService as any, false, event);

        expect(highlightService.setPending).toHaveBeenCalledWith('Notes/Target.md', 'Target');
        expect(app.workspace.openLinkText).toHaveBeenCalledWith('Notes/Target.md', 'Notes/Source.md', false);
        expect(event.preventDefault).toHaveBeenCalled();
        expect(event.stopPropagation).toHaveBeenCalled();
    });

    it('opens all candidate files when clicking the primary link of a multi-candidate match', async () => {
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

            const anchor = {
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
                    closest: (selector: string) => selector === '.virtual-link-a' ? anchor : null,
                },
                preventDefault: jest.fn(),
                stopPropagation: jest.fn(),
            } as unknown as MouseEvent;

            const clickPromise = handleVirtualLinkClickEvent(app as any, highlightService as any, false, event);

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

        await handleVirtualLinkClickEvent(app as any, highlightService as any, false, event);

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

            const clickPromise = handleVirtualLinkClickEvent(app as any, highlightService as any, false, event);

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

        await handleVirtualLinkClickEvent(app as any, highlightService as any, false, event);

        expect(highlightService.setPending).not.toHaveBeenCalled();
        expect(app.workspace.openLinkText).not.toHaveBeenCalled();
        expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('is a no-op when the modifier gate is on and no modifier is held', async () => {
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
            metaKey: false,
            ctrlKey: false,
            target: {
                closest: (selector: string) => selector === '.virtual-link-a' ? anchor : null,
            },
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
        } as unknown as MouseEvent;

        await handleVirtualLinkClickEvent(app as any, highlightService as any, true, event);

        expect(highlightService.setPending).not.toHaveBeenCalled();
        expect(app.workspace.openLinkText).not.toHaveBeenCalled();
        expect(event.preventDefault).toHaveBeenCalled();
        expect(event.stopPropagation).toHaveBeenCalled();
    });

    it('navigates when the modifier gate is on and the modifier is held', async () => {
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
            metaKey: true,
            ctrlKey: false,
            target: {
                closest: (selector: string) => selector === '.virtual-link-a' ? anchor : null,
            },
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
        } as unknown as MouseEvent;

        await handleVirtualLinkClickEvent(app as any, highlightService as any, true, event);

        expect(highlightService.setPending).toHaveBeenCalledWith('Notes/Target.md', 'Target');
        expect(app.workspace.openLinkText).toHaveBeenCalledWith('Notes/Target.md', 'Notes/Source.md', true);
    });

    it('reads data-real-href when present, ignoring the blocked href sentinel', async () => {
        const app = {
            workspace: {
                getActiveFile: () => makeFile('Notes/Source.md'),
                openLinkText: jest.fn(async () => undefined),
            },
        };
        const highlightService = { setPending: jest.fn() };

        const anchor = {
            getAttribute: (name: string) => {
                if (name === 'data-real-href') return 'Notes/Target.md';
                if (name === 'href') return '#__virtual_autolink_blocked__';
                if (name === 'origin-text') return 'Target';
                return null;
            },
        };

        const event = {
            button: 0,
            metaKey: true,
            ctrlKey: false,
            target: {
                closest: (selector: string) => selector === '.virtual-link-a' ? anchor : null,
            },
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
        } as unknown as MouseEvent;

        await handleVirtualLinkClickEvent(app as any, highlightService as any, true, event);

        expect(app.workspace.openLinkText).toHaveBeenCalledWith('Notes/Target.md', 'Notes/Source.md', true);
    });
});

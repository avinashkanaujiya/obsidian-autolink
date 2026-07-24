import { GlossaryLinker } from '../linker/readModeLinker';
import { LinkerCache } from '../linker/linkerCache';
import { LinkerPluginSettings } from '../main';

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
    useDefaultLinkStyleForConversion: true,
    defaultUseMarkdownLinks: false,
    defaultLinkFormat: 'shortest',
    useMarkdownLinks: false,
    linkFormat: 'shortest',
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
    alwaysShowMultipleReferences: false,
    customFrontmatterFields: [],
    requireModifierForCandidateLinks: false,
};

describe('GlossaryLinker reading-mode formatting support', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('scans highlight and strikethrough containers for inline text', () => {
        const getInstanceSpy = jest.spyOn(LinkerCache, 'getInstance').mockReturnValue({} as LinkerCache);

        try {
            const requestedTags: string[] = [];
            const containerEl = {
                querySelectorAll: jest.fn(() => []),
                getElementsByTagName: jest.fn((tag: string) => {
                    requestedTags.push(tag);
                    return {
                        length: 0,
                        item: () => null,
                    };
                }),
                childNodes: [],
            } as unknown as HTMLElement;

            const context = {
                sourcePath: 'Notes/Source.md',
                getSectionInfo: jest.fn(() => null),
            };

            const app = {
                metadataCache: {
                    getFirstLinkpathDest: jest.fn(() => null),
                },
            };

            const linker = new GlossaryLinker(app as any, BASE_SETTINGS, context as any, containerEl);
            linker.onload();

            expect(requestedTags).toEqual(expect.arrayContaining(['mark', 'del', 's']));
        } finally {
            getInstanceSpy.mockRestore();
        }
    });

    it('passes the rendered note path when suppressing self-links', () => {
        const getCurrentMatchNodes = jest.fn(() => []);
        const getInstanceSpy = jest.spyOn(LinkerCache, 'getInstance').mockReturnValue({
            reset: jest.fn(),
            cache: {
                getCurrentMatchNodes,
                pushChar: jest.fn(),
            },
        } as unknown as LinkerCache);

        const previousNode = (globalThis as { Node?: { TEXT_NODE: number } }).Node;
        const previousDocument = (globalThis as { document?: { createTextNode: (text: string) => unknown } }).document;
        (globalThis as { Node?: { TEXT_NODE: number } }).Node = { TEXT_NODE: 3 };
        (globalThis as { document?: { createTextNode: (text: string) => unknown } }).document = {
            createTextNode: (text: string) => ({ textContent: text }),
        };

        try {
            const parentElement = {
                insertBefore: jest.fn(),
                removeChild: jest.fn(),
            };
            const textNode = {
                nodeType: 3,
                textContent: 'Plato',
                parentElement,
            };
            const containerEl = {
                querySelectorAll: jest.fn(() => []),
                getElementsByTagName: jest.fn(() => ({
                    length: 0,
                    item: () => null,
                })),
                childNodes: [textNode],
            } as unknown as HTMLElement;

            const context = {
                sourcePath: 'Notes/Rendered.md',
                getSectionInfo: jest.fn(() => null),
            };
            const app = {
                metadataCache: {
                    getFirstLinkpathDest: jest.fn(() => null),
                },
            };

            const linker = new GlossaryLinker(app as any, BASE_SETTINGS, context as any, containerEl);
            linker.onload();

            expect(getCurrentMatchNodes).toHaveBeenCalled();
            getCurrentMatchNodes.mock.calls.forEach((call) => {
                expect((call as unknown[])[1]).toBe('Notes/Rendered.md');
            });
        } finally {
            if (previousNode) {
                (globalThis as { Node?: { TEXT_NODE: number } }).Node = previousNode;
            } else {
                delete (globalThis as { Node?: { TEXT_NODE: number } }).Node;
            }
            if (previousDocument) {
                (globalThis as { document?: { createTextNode: (text: string) => unknown } }).document = previousDocument;
            } else {
                delete (globalThis as { document?: { createTextNode: (text: string) => unknown } }).document;
            }
            getInstanceSpy.mockRestore();
        }
    });
});

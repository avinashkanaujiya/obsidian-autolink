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
};

describe('GlossaryLinker reading-mode formatting support', () => {
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
});

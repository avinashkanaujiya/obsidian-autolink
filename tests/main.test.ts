import LinkerPlugin, {
    buildRelativeVaultPath,
    LinkerPluginSettings,
    normalizeFrontmatterTags,
} from '../main';
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

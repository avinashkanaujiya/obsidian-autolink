import {
    buildDirectoryPattern,
    LinkerMetaInfoFetcher,
    matchesDirectorySetting,
} from '../linker/linkerInfo';
import { LinkerPluginSettings } from '../main';
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
    excludeLinksToOwnNote: false,
    fixIMEProblem: false,
    excludeLinksInCurrentLine: false,
    onlyLinkOnce: true,
    excludeLinksToRealLinkedFiles: true,
    includeAliases: true,
    alwaysShowMultipleReferences: false,
    customFrontmatterFields: [],
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

function makeApp(files: TFile[] = []) {
    const fileMap = new Map<string, TFile>(files.map((file) => [file.path, file]));
    return {
        vault: {
            getFileByPath: (path: string) => fileMap.get(path) ?? null,
        },
        metadataCache: {
            getFileCache: () => null,
        },
    };
}

describe('buildDirectoryPattern', () => {
    it('escapes regex metacharacters in folder names', () => {
        const pattern = buildDirectoryPattern(['C++', '[Draft]']);

        expect(pattern.test('C++/Note.md')).toBe(true);
        expect(pattern.test('[Draft]/Outline.md')).toBe(true);
        expect(pattern.test('C/Note.md')).toBe(false);
    });

    it('anchors full folder paths to the vault root', () => {
        const pattern = buildDirectoryPattern(['Topics/Glossary']);

        expect(pattern.test('Topics/Glossary/Term.md')).toBe(true);
        expect(pattern.test('Archive/Topics/Glossary/Term.md')).toBe(false);
    });
});

describe('matchesDirectorySetting', () => {
    it('keeps legacy bare folder names working', () => {
        expect(matchesDirectorySetting('Archive/Glossary/Term.md', ['Glossary'])).toBe(true);
    });

    it('matches exact folder paths when configured', () => {
        expect(matchesDirectorySetting('Projects/Glossary/Term.md', ['Projects/Glossary'])).toBe(true);
        expect(matchesDirectorySetting('Archive/Glossary/Term.md', ['Projects/Glossary'])).toBe(false);
    });
});

describe('LinkerMetaInfoFetcher', () => {
    it('applies path-based include rules when includeAllFiles=false', () => {
        const file = makeFile('Topics/Glossary/Term.md');
        const app = makeApp([file]);
        const fetcher = new LinkerMetaInfoFetcher(app as never, {
            ...BASE_SETTINGS,
            includeAllFiles: false,
            linkerDirectories: ['Topics/Glossary'],
        });

        const metaInfo = fetcher.getMetaInfo(file);
        expect(metaInfo.isInIncludedDir).toBe(true);
        expect(metaInfo.isInExcludedDir).toBe(false);
    });
});

import { PrefixTree, ExternalUpdateManager } from '../linker/linkerCache';
import { App, TFile } from 'obsidian';
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
    excludeLinksToOwnNote: false,
    fixIMEProblem: false,
    excludeLinksInCurrentLine: false,
    onlyLinkOnce: true,
    excludeLinksToRealLinkedFiles: true,
    includeAliases: true,
    alwaysShowMultipleReferences: false,
    customFrontmatterFields: [],
};

function makeFile(filePath: string): TFile {
    const base = filePath.split('/').pop() ?? filePath;
    return {
        path: filePath,
        basename: base.replace(/\.md$/, ''),
        extension: 'md',
        stat: { mtime: 1000, ctime: 1000, size: 0 },
        parent: null,
    } as unknown as TFile;
}

type MockFileCache = {
    frontmatter: Record<string, unknown> | null;
    tags: unknown;
} | null;

type MockApp = {
    vault: {
        getMarkdownFiles: () => TFile[];
        getFileByPath: (path: string) => TFile | null;
    };
    metadataCache: {
        getFileCache: (file: TFile) => MockFileCache;
    };
    workspace: {
        getActiveFile: () => TFile | null;
    };
    _setCache: (path: string, cache: MockFileCache) => void;
    _updateFiles: (newFiles: TFile[]) => void;
};

function makeApp(files: TFile[] = []): MockApp {
    const fileCaches = new Map<string, MockFileCache>();
    const fileMap = new Map<string, TFile>(files.map((file) => [file.path, file]));
    const app: MockApp = {
        vault: {
            getMarkdownFiles: () => files,
            getFileByPath: (path: string) => fileMap.get(path) ?? null,
        },
        metadataCache: { getFileCache: (file: TFile) => fileCaches.get(file.path) ?? null },
        workspace: { getActiveFile: () => null },
        _setCache(path: string, cache: MockFileCache) { fileCaches.set(path, cache); },
        _updateFiles(newFiles: TFile[]) {
            files.length = 0;
            files.push(...newFiles);
            fileMap.clear();
            newFiles.forEach((file) => fileMap.set(file.path, file));
        },
    };
    return app;
}

function buildTree(files: TFile[], settings = BASE_SETTINGS): PrefixTree {
    const app = makeApp(files);
    for (const f of files) {
        app._setCache(f.path, { frontmatter: null, tags: null });
    }
    return new PrefixTree(app as unknown as App, settings);
}

/** Walk `text` through the trie and return true if any match is found. */
function findInText(tree: PrefixTree, text: string): boolean {
    tree.resetSearch();
    for (let i = 0; i <= text.length; i++) {
        const ch = i < text.length ? text[i] : '\n';
        if (PrefixTree.checkWordBoundary(ch)) {
            if (tree.getCurrentMatchNodes(i).length > 0) return true;
        }
        tree.pushChar(ch);
    }
    return false;
}

// ---------------------------------------------------------------------------
// PrefixTree.checkWordBoundary
// ---------------------------------------------------------------------------
describe('PrefixTree.checkWordBoundary', () => {
    it('treats space as a word boundary', () => {
        expect(PrefixTree.checkWordBoundary(' ')).toBe(true);
    });

    it('treats common punctuation as word boundaries', () => {
        for (const ch of ['.', ',', '!', '?', ':', ';', '(', ')', '[', ']', '\n', '\t']) {
            expect(PrefixTree.checkWordBoundary(ch)).toBe(true);
        }
    });

    it('treats ASCII letters as non-boundaries', () => {
        for (const ch of ['a', 'z', 'A', 'Z', 'm']) {
            expect(PrefixTree.checkWordBoundary(ch)).toBe(false);
        }
    });

    it('treats unicode letters as non-boundaries', () => {
        for (const ch of ['é', 'ü', 'ñ', 'ø', 'α']) {
            expect(PrefixTree.checkWordBoundary(ch)).toBe(false);
        }
    });

    it('treats digits as boundaries (non-letter characters)', () => {
        expect(PrefixTree.checkWordBoundary('5')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// PrefixTree.isUpperCaseString (private static — accessed via cast)
// ---------------------------------------------------------------------------
describe('PrefixTree.isUpperCaseString', () => {
    const prefixTreePrivate = PrefixTree as unknown as {
        isUpperCaseString: (value: unknown, upperCasePart?: number) => boolean;
    };
    const isUpper = (value: unknown, pct = 0.75) => prefixTreePrivate.isUpperCaseString(value, pct);

    it('returns true for all-uppercase abbreviations', () => {
        expect(isUpper('CPU')).toBe(true);
        expect(isUpper('API')).toBe(true);
        expect(isUpper('HTTP')).toBe(true);
    });

    it('returns false for all-lowercase words', () => {
        expect(isUpper('hello')).toBe(false);
        expect(isUpper('world')).toBe(false);
    });

    it('returns false for mixed-case words below threshold', () => {
        expect(isUpper('Hello')).toBe(false); // 1/5 letters uppercase = 20%
    });

    it('does not count digits/symbols as uppercase letters (fixed bug)', () => {
        // Pure digit string has no letters → false
        expect(isUpper('1234')).toBe(false);
        // Pure symbol string has no letters → false
        expect(isUpper('---')).toBe(false);
        // "ab12": letters a,b = 0% uppercase → false
        expect(isUpper('ab12')).toBe(false);
        // "CPU2": letters C,P,U = 100% uppercase → true (digits excluded)
        expect(isUpper('CPU2')).toBe(true);
    });

    it('returns false for null/undefined/empty strings', () => {
        expect(isUpper(null)).toBe(false);
        expect(isUpper(undefined)).toBe(false);
        expect(isUpper('')).toBe(false);
        expect(isUpper('   ')).toBe(false);
    });

    it('respects a custom threshold', () => {
        expect(isUpper('Hello', 0.2)).toBe(true);  // 20% uppercase ≥ 20%
        expect(isUpper('Hello', 0.5)).toBe(false); // 20% uppercase < 50%
    });
});

// ---------------------------------------------------------------------------
// PrefixTree trie: insert and search
// ---------------------------------------------------------------------------
describe('PrefixTree trie search', () => {
    it('finds a file by its exact basename', () => {
        const file = makeFile('Glossary/Photosynthesis.md');
        const tree = buildTree([file]);
        expect(findInText(tree, 'Photosynthesis ')).toBe(true);
    });

    it('matches case-insensitively when matchCaseSensitive=false', () => {
        const file = makeFile('Glossary/Chlorophyll.md');
        const tree = buildTree([file]);
        expect(findInText(tree, 'chlorophyll ')).toBe(true);
    });

    it('does not match unrelated text', () => {
        const file = makeFile('Glossary/Mitosis.md');
        const tree = buildTree([file]);
        expect(findInText(tree, 'unrelated stuff here ')).toBe(false);
    });

    it('removes a file from the tree after vault update', () => {
        const file = makeFile('Glossary/Enzyme.md');
        const tree = buildTree([file]);
        expect(findInText(tree, 'Enzyme ')).toBe(true);

        // Simulate vault no longer containing the file
        const emptyApp = makeApp([]);
        tree.app = emptyApp as unknown as App;
        tree.updateTree();

        expect(findInText(tree, 'Enzyme ')).toBe(false);
    });

    it('finds a file after it is added via updateTree', () => {
        // Use a shared app so tree.fetcher.app and tree.app stay in sync
        const app = makeApp([]);
        const tree = new PrefixTree(app as unknown as App, BASE_SETTINGS);
        expect(findInText(tree, 'Ribosome ')).toBe(false);

        const file = makeFile('Glossary/Ribosome.md');
        app._setCache(file.path, { frontmatter: null, tags: null });
        app._updateFiles([file]);
        tree.updateTree();

        expect(findInText(tree, 'Ribosome ')).toBe(true);
    });

    it('matches file aliases when includeAliases=true', () => {
        const file = makeFile('Glossary/Deoxyribonucleic Acid.md');
        const app = makeApp([file]);
        app._setCache(file.path, {
            frontmatter: { aliases: ['DNA'] },
            tags: null,
        });
        const tree = new PrefixTree(app as unknown as App, BASE_SETTINGS);
        expect(findInText(tree, 'DNA ')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// ExternalUpdateManager
// ---------------------------------------------------------------------------
describe('ExternalUpdateManager', () => {
    it('calls registered callbacks on update', (done) => {
        const mgr = new ExternalUpdateManager();
        let called = false;
        mgr.registerCallback(() => { called = true; });
        mgr.update();
        setTimeout(() => {
            expect(called).toBe(true);
            done();
        }, 100);
    });

    it('does not call deregistered callbacks', (done) => {
        const mgr = new ExternalUpdateManager();
        let called = false;
        const cb = () => { called = true; };
        mgr.registerCallback(cb);
        mgr.deregisterCallback(cb);
        mgr.update();
        setTimeout(() => {
            expect(called).toBe(false);
            done();
        }, 100);
    });

    it('can register multiple callbacks and calls all of them', (done) => {
        const mgr = new ExternalUpdateManager();
        let count = 0;
        mgr.registerCallback(() => count++);
        mgr.registerCallback(() => count++);
        mgr.registerCallback(() => count++);
        mgr.update();
        setTimeout(() => {
            expect(count).toBe(3);
            done();
        }, 100);
    });
});

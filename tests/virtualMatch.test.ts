import { TFile } from 'obsidian';
import { VirtualMatch } from '../linker/virtualLinkDom';
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

function makeMatch(
    id: number,
    from: number,
    to: number,
    files: TFile[],
    settings: LinkerPluginSettings = BASE_SETTINGS,
    originText = 'text'
): VirtualMatch {
    return new VirtualMatch(id, originText, from, to, files, false, false, settings);
}

type MockTextNode = {
    nodeType: 3;
    textContent: string;
};

type MockElement = {
    tagName: string;
    children: Array<MockElement | MockTextNode>;
    textContent: string;
    classNames: string[];
    attributes: Record<string, string>;
    classList: {
        add: (...tokens: string[]) => void;
        contains: (token: string) => boolean;
    };
    appendChild: (child: MockElement | MockTextNode) => MockElement | MockTextNode;
    setAttribute: (name: string, value: string) => void;
    getAttribute: (name: string) => string | null;
    href?: string;
    target?: string;
    rel?: string;
};

function createMockElement(tagName: string): MockElement {
    const element = {
        tagName,
        children: [],
        textContent: '',
        classNames: [],
        attributes: {},
        classList: {
            add: (...tokens: string[]) => {
                element.classNames.push(...tokens);
            },
            contains: (token: string) => element.classNames.includes(token),
        },
        appendChild: (child: MockElement | MockTextNode) => {
            element.children.push(child);
            return child;
        },
        setAttribute: (name: string, value: string) => {
            element.attributes[name] = value;
        },
        getAttribute: (name: string) => element.attributes[name] ?? null,
    } as MockElement;

    return element;
}

function createMockDocument() {
    return {
        createElement: (tagName: string) => createMockElement(tagName),
        createTextNode: (text: string): MockTextNode => ({
            nodeType: 3,
            textContent: text,
        }),
    };
}

function hasClass(node: MockElement | MockTextNode, className: string): node is MockElement {
    return 'classNames' in node && node.classNames.includes(className);
}

// ---------------------------------------------------------------------------
// VirtualMatch.sort
// ---------------------------------------------------------------------------
describe('VirtualMatch.sort', () => {
    it('sorts by from position ascending', () => {
        const f = makeFile('a.md');
        const matches = [
            makeMatch(0, 10, 15, [f]),
            makeMatch(1, 2, 8, [f]),
            makeMatch(2, 5, 9, [f]),
        ];
        const sorted = VirtualMatch.sort(matches);
        expect(sorted.map((m: VirtualMatch) => m.from)).toEqual([2, 5, 10]);
    });

    it('for equal from positions, places longer match first', () => {
        const f = makeFile('a.md');
        const matches = [
            makeMatch(0, 5, 8, [f]),   // length 3
            makeMatch(1, 5, 12, [f]),  // length 7
        ];
        const sorted = VirtualMatch.sort(matches);
        expect(sorted[0].to).toBe(12);
        expect(sorted[1].to).toBe(8);
    });

    it('does not mutate the original array', () => {
        const f = makeFile('a.md');
        const original = [makeMatch(0, 10, 15, [f]), makeMatch(1, 2, 5, [f])];
        const firstFrom = original[0].from;
        VirtualMatch.sort(original);
        expect(original[0].from).toBe(firstFrom);
    });
});

// ---------------------------------------------------------------------------
// VirtualMatch.filterAlreadyLinked
// ---------------------------------------------------------------------------
describe('VirtualMatch.filterAlreadyLinked', () => {
    it('keeps matches whose files are not in the linked set', () => {
        const f1 = makeFile('note1.md');
        const f2 = makeFile('note2.md');
        const linked = new Set<TFile>([f1]);
        const matches = [makeMatch(0, 0, 5, [f1]), makeMatch(1, 6, 10, [f2])];
        const result = VirtualMatch.filterAlreadyLinked(matches, linked);
        expect(result).toHaveLength(1);
        expect(result[0].files[0]).toBe(f2);
    });

    it('keeps a match when not ALL files are linked (every mode default)', () => {
        const f1 = makeFile('note1.md');
        const f2 = makeFile('note2.md');
        const linked = new Set<TFile>([f1]);
        // match has both f1 and f2 — f2 is NOT linked, so match must be kept
        const matches = [makeMatch(0, 0, 5, [f1, f2])];
        const result = VirtualMatch.filterAlreadyLinked(matches, linked, 'every');
        expect(result).toHaveLength(1);
    });

    it('removes match when ANY file is linked (some mode)', () => {
        const f1 = makeFile('note1.md');
        const f2 = makeFile('note2.md');
        const linked = new Set<TFile>([f1]);
        const matches = [makeMatch(0, 0, 5, [f1, f2])];
        const result = VirtualMatch.filterAlreadyLinked(matches, linked, 'some');
        expect(result).toHaveLength(0);
    });

    it('returns all matches when linked set is empty', () => {
        const f = makeFile('a.md');
        const matches = [makeMatch(0, 0, 5, [f]), makeMatch(1, 6, 10, [f])];
        const result = VirtualMatch.filterAlreadyLinked(matches, new Set());
        expect(result).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// VirtualMatch.filterOverlapping
// ---------------------------------------------------------------------------
describe('VirtualMatch.filterOverlapping', () => {
    it('removes shorter match when two overlap', () => {
        const f = makeFile('a.md');
        const matches = [makeMatch(0, 0, 10, [f]), makeMatch(1, 5, 8, [f])];
        const result = VirtualMatch.filterOverlapping(matches);
        expect(result).toHaveLength(1);
        expect(result[0].to).toBe(10);
    });

    it('keeps non-overlapping matches', () => {
        const f1 = makeFile('a.md');
        const f2 = makeFile('b.md');
        const matches = [makeMatch(0, 0, 5, [f1]), makeMatch(1, 6, 10, [f2])];
        const result = VirtualMatch.filterOverlapping(matches, false);
        expect(result).toHaveLength(2);
    });

    it('removes duplicate-file match when onlyLinkOnce=true', () => {
        const f = makeFile('a.md');
        const matches = [makeMatch(0, 0, 5, [f]), makeMatch(1, 10, 15, [f])];
        expect(VirtualMatch.filterOverlapping(matches, true)).toHaveLength(1);
        expect(VirtualMatch.filterOverlapping(matches, false)).toHaveLength(2);
    });

    it('keeps adjacent (touching) non-overlapping matches', () => {
        const f1 = makeFile('b.md');
        const f2 = makeFile('c.md');
        const matches = [makeMatch(0, 0, 5, [f1]), makeMatch(1, 5, 10, [f2])];
        expect(VirtualMatch.filterOverlapping(matches, false)).toHaveLength(2);
    });
});

describe('VirtualMatch DOM rendering', () => {
    const testGlobal = global as any;
    const originalDocument = testGlobal.document;

    beforeEach(() => {
        testGlobal.document = createMockDocument();
    });

    afterEach(() => {
        testGlobal.document = originalDocument;
    });

    it('keeps the multi-candidate chooser hidden until hover by omitting the placeholder suffix', () => {
        const match = makeMatch(0, 0, 5, [makeFile('a.md'), makeFile('b.md')]);
        const root = match.getCompleteLinkElement() as unknown as MockElement;

        expect(root.children.some((child) => hasClass(child, 'multiple-files-indicator'))).toBe(false);
        expect(root.children.some((child) => hasClass(child, 'multiple-files-references'))).toBe(true);
    });
});

describe('VirtualMatch.filterDuplicateLineMatches', () => {
    it('keeps only the first identical match per line', () => {
        const f = makeFile('plato.md');
        const matches = [
            makeMatch(0, 0, 5, [f], BASE_SETTINGS, 'Plato'),
            makeMatch(1, 12, 17, [f], BASE_SETTINGS, 'Plato'),
            makeMatch(2, 24, 29, [f], BASE_SETTINGS, 'Plato'),
        ];

        const result = VirtualMatch.filterDuplicateLineMatches(matches, () => 1);
        expect(result.map((match) => match.id)).toEqual([0]);
    });

    it('keeps repeated terms when they are on different lines', () => {
        const f = makeFile('plato.md');
        const matches = [
            makeMatch(0, 0, 5, [f], BASE_SETTINGS, 'Plato'),
            makeMatch(1, 12, 17, [f], BASE_SETTINGS, 'Plato'),
        ];

        const result = VirtualMatch.filterDuplicateLineMatches(matches, (match) => match.id);
        expect(result.map((match) => match.id)).toEqual([0, 1]);
    });

    it('keeps different targets for the same text on one line', () => {
        const f1 = makeFile('plato-philosopher.md');
        const f2 = makeFile('plato-dialogues.md');
        const matches = [
            makeMatch(0, 0, 5, [f1], BASE_SETTINGS, 'Plato'),
            makeMatch(1, 12, 17, [f2], BASE_SETTINGS, 'Plato'),
        ];

        const result = VirtualMatch.filterDuplicateLineMatches(matches, () => 1);
        expect(result.map((match) => match.id)).toEqual([0, 1]);
    });

    it('can deduplicate across multiple calls when a shared seen set is provided', () => {
        const f = makeFile('plato.md');
        const seen = new Set<string>();

        const first = VirtualMatch.filterDuplicateLineMatches(
            [makeMatch(0, 0, 5, [f], BASE_SETTINGS, 'Plato')],
            () => 4,
            seen,
        );
        const second = VirtualMatch.filterDuplicateLineMatches(
            [makeMatch(1, 12, 17, [f], BASE_SETTINGS, 'Plato')],
            () => 4,
            seen,
        );

        expect(first.map((match) => match.id)).toEqual([0]);
        expect(second).toEqual([]);
    });
});

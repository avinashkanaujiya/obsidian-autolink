import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, PluginSpec, PluginValue, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { App, MarkdownView, TFile, Vault } from 'obsidian';

import IntervalTree from '@flatten-js/interval-tree';
import { LinkerPluginSettings } from 'main';
import { ExternalUpdateManager, LinkerCache, PrefixTree } from './linkerCache';
import { matchesDirectorySetting } from './linkerInfo';
import { VirtualMatch } from './virtualLinkDom';
import { findFirstMatch, HighlightService } from './highlightService';

function isDescendant(parent: HTMLElement, child: HTMLElement, maxDepth = Number.POSITIVE_INFINITY) {
    let node = child.parentNode;
    let depth = 0;
    while (node != null && depth < maxDepth) {
        if (node === parent) {
            return true;
        }
        node = node.parentNode;
        depth++;
    }
    return false;
}

export function resolveMarkdownViewForEditorDOM(app: App, editorDom: HTMLElement): MarkdownView | null {
    let resolvedView: MarkdownView | null = null;

    app.workspace.iterateAllLeaves((leaf) => {
        if (resolvedView || !(leaf.view instanceof MarkdownView)) {
            return;
        }

        const contentEl = leaf.view.contentEl;
        if (contentEl && isDescendant(contentEl, editorDom)) {
            resolvedView = leaf.view;
        }
    });

    return resolvedView;
}

export class VirtualLinkWidget extends WidgetType {
    constructor(
        public match: VirtualMatch,
        public highlightText: string | null = null,
        public syntaxClasses: string[] = [],
    ) {
        super();
    }
    toDOM(_view: EditorView): HTMLElement {
        return this.match.getCompleteLinkElement(this.highlightText, this.syntaxClasses);
    }
}

const LIVE_PREVIEW_SYNTAX_CLASSES = ['cm-highlight', 'cm-strikethrough', 'cm-strong', 'cm-em'];

function addVirtualLinkSyntaxClassesFromNode(node: Node | null | undefined, classes: Set<string>): void {
    let current: Node | null | undefined = node;
    while (current) {
        const classList = (current as { classList?: DOMTokenList }).classList;
        if (classList) {
            LIVE_PREVIEW_SYNTAX_CLASSES.forEach((className) => {
                if (classList.contains(className)) {
                    classes.add(className);
                }
            });
        }
        current = current.parentNode;
    }
}

function safeDomNodeAtPos(view: EditorView, pos: number): Node | null {
    try {
        return view.domAtPos(pos).node;
    } catch {
        return null;
    }
}

export function collectVirtualLinkSyntaxClasses(view: EditorView, from: number, to: number): string[] {
    const classes = new Set<string>();

    addVirtualLinkSyntaxClassesFromNode(safeDomNodeAtPos(view, from), classes);
    if (to > from) {
        addVirtualLinkSyntaxClassesFromNode(safeDomNodeAtPos(view, to - 1), classes);
    }

    return Array.from(classes);
}

class VirtualAutoLinkerPlugin implements PluginValue {
    decorations: DecorationSet;
    app: App;
    vault: Vault;
    linkerCache: LinkerCache;

    settings: LinkerPluginSettings;
    highlightService: HighlightService | null;

    private lastCursorPos = 0;
    private lastSourceFilePath = '';
    private lastViewUpdate: ViewUpdate | null = null;
    private updateManager: ExternalUpdateManager;
    private updateCallback: () => void;
    private highlightUnsubscribe: (() => void) | null = null;
    private readonly viewUpdateDomToFileMap = new Map<HTMLElement, TFile | null>();

    constructor(view: EditorView, app: App, settings: LinkerPluginSettings, updateManager: ExternalUpdateManager, highlightService: HighlightService | null = null) {
        this.app = app;
        this.settings = settings;
        this.updateManager = updateManager;

        const { vault } = this.app;
        this.vault = vault;

        this.linkerCache = LinkerCache.getInstance(app, this.settings);
        this.highlightService = highlightService;

        const { sourceFile, viewIsActive } = this.resolveSourceContext(view);
        this.decorations = this.buildDecorations(view, sourceFile, viewIsActive);

        this.updateCallback = () => {
            if (this.lastViewUpdate) {
                this.update(this.lastViewUpdate, true);
            }
        };
        updateManager.registerCallback(this.updateCallback);

        if (highlightService) {
            this.highlightUnsubscribe = highlightService.onUpdate(() => {
                if (this.lastViewUpdate) {
                    this.update(this.lastViewUpdate, true);
                }
            });
        }
    }

    update(update: ViewUpdate, force = false) {
        const { sourceFile, viewIsActive } = this.resolveSourceContext(update.view);
        const cursorPos = update.view.state.selection.main.from;
        const sourceFilePath = sourceFile?.path ?? '';
        const fileChanged = sourceFilePath !== this.lastSourceFilePath;

        if (force || this.lastCursorPos !== cursorPos || update.docChanged || fileChanged || update.viewportChanged) {
            this.lastCursorPos = cursorPos;
            this.linkerCache.updateCache(force);
            this.decorations = this.buildDecorations(update.view, sourceFile, viewIsActive);
            this.lastSourceFilePath = sourceFilePath;
        }

        this.lastViewUpdate = update;
    }

    destroy() {
        this.updateManager.deregisterCallback(this.updateCallback);
        if (this.highlightUnsubscribe) this.highlightUnsubscribe();
        this.viewUpdateDomToFileMap.clear();
    }

    private resolveSourceContext(view: EditorView): { sourceFile: TFile | null; viewIsActive: boolean } {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        const markdownView = resolveMarkdownViewForEditorDOM(this.app, view.dom);
        const cachedSourceFile = this.viewUpdateDomToFileMap.get(view.dom) ?? null;
        const activeViewOwnsEditor = !!activeView?.contentEl && isDescendant(activeView.contentEl, view.dom);

        const sourceFile = cachedSourceFile
            ?? markdownView?.file
            ?? (activeViewOwnsEditor ? activeView?.file ?? null : null);

        if (sourceFile) {
            this.viewUpdateDomToFileMap.set(view.dom, sourceFile);
        }

        const viewIsActive = markdownView !== null
            ? markdownView === activeView
            : !!(sourceFile && activeView?.file && activeViewOwnsEditor && sourceFile.path === activeView.file.path);

        return {
            sourceFile,
            viewIsActive,
        };
    }

    buildDecorations(view: EditorView, sourceFile: TFile | null = null, viewIsActive = true): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();

        if (!this.settings.linkerActivated) {
            return builder.finish();
        }

        // Check if the file is inside excluded folders
        const excludedFolders = this.settings.excludedDirectoriesForLinking;
        if (excludedFolders.length > 0) {
            const parentPath = sourceFile?.parent?.path;
            if (parentPath && matchesDirectorySetting(parentPath, excludedFolders)) return builder.finish();
        }

        // Set to exclude file that are explicitly linked
        const explicitlyLinkedFiles = new Set<TFile>();

        // Set to exclude files that are already linked by a virtual link
        const alreadyLinkedFiles = new Set<TFile>();

        // Highlight at most one occurrence per visible document line.
        const highlightedLineNumbers = new Set<number>();
        const duplicateLineMatchKeys = new Set<string>();

        for (const { from, to } of view.visibleRanges) {
            this.linkerCache.reset();
            const text = view.state.doc.sliceString(from, to);

            // For every glossary file and its aliases we now search the text for occurrences
            // const additions: { id: number; files: TFile[]; from: number; to: number; widget: WidgetType }[] = [];
            let matches: VirtualMatch[] = [];
            let id = 0;
            // Iterate over every char in the text
            for (let i = 0; i <= text.length; i) {
                // Do this to get unicode characters as whole chars and not only half of them
                const char = i < text.length
                    ? String.fromCodePoint(text.codePointAt(i) ?? text.charCodeAt(i))
                    : '\n';

                // If we are at a word boundary, get the current fitting files
                const isWordBoundary = PrefixTree.checkWordBoundary(char); // , this.settings.wordBoundaryRegex
                if (this.settings.matchAnyPartsOfWords || this.settings.matchBeginningOfWords || isWordBoundary) {
                    const currentNodes = this.linkerCache.cache.getCurrentMatchNodes(
                        i,
                        this.settings.excludeLinksToOwnNote ? sourceFile?.path ?? null : null
                    );

                    if (currentNodes.length > 0) {
                        for (const node of currentNodes) {
                            // Check if we want to include this note based on the settings
                            if (!this.settings.matchAnyPartsOfWords) {
                                if (
                                    (this.settings.matchBeginningOfWords && !node.startsAtWordBoundary) &&
                                    (this.settings.matchEndOfWords && !isWordBoundary)
                                ) {
                                    continue;
                                }
                            }

                            const nFrom = node.start;
                            const nTo = node.end;
                            const name = text.slice(nFrom, nTo);
                            const isAlias = node.isAlias;

                            const aFrom = from + nFrom;
                            const aTo = from + nTo;


                            matches.push(
                                new VirtualMatch(id++, name, aFrom, aTo, Array.from(node.files), isAlias, !isWordBoundary, this.settings)
                            );
                        }
                    }
                }

                // Push the char to get the next nodes in the prefix tree
                this.linkerCache.cache.pushChar(char);

                i += char.length;
            }

            // Sort additions by position and files length
            matches = VirtualMatch.sort(matches);

            // We want to exclude some syntax nodes from being decorated,
            // such as code blocks and manually added links
            const excludedIntervalTree = new IntervalTree();
            const excludedTypes = ['codeblock', 'code-block', 'inline-code', 'internal-link', 'link', 'url', 'hashtag'];

            if (!this.settings.includeHeaders) {
                excludedTypes.push('header-');
            }

            // We also want to exclude links to files that are already linked by a real link
            const app = this.app;
            syntaxTree(view.state).iterate({
                from,
                to,
                enter(node) {
                    const type = node.type.name;
                    const types = type.split('_');
                    // const text = view.state.doc.sliceString(node.from, node.to);

                    for (const excludedType of excludedTypes) {
                        if (type.includes(excludedType)) {
                            excludedIntervalTree.insert([node.from, node.to]);

                            // Types can be combined, e.g. internal-link_link-has-alias
                            // These combined types are separated by underscores
                            const isLinkIfHavingTypes = [['string', 'url'], 'hmd-internal-link', 'internal-link'];

                            isLinkIfHavingTypes.forEach((t) => {
                                const tList = Array.isArray(t) ? t : [t];

                                if (tList.every((tt) => types.includes(tt))) {
                                    const text = view.state.doc.sliceString(node.from, node.to);
                                    const linkedFile = app.metadataCache.getFirstLinkpathDest(text, sourceFile?.path ?? '');
                                    if (linkedFile) {
                                        explicitlyLinkedFiles.add(linkedFile);
                                    }
                                }
                            });
                        }
                    }
                },
            });

            // Delete additions that links to already linked files
            if (this.settings.excludeLinksToRealLinkedFiles) {
                matches = VirtualMatch.filterAlreadyLinked(matches, explicitlyLinkedFiles);
            }

            // Delete additions that links to already linked files
            if (this.settings.onlyLinkOnce) {
                matches = VirtualMatch.filterAlreadyLinked(matches, alreadyLinkedFiles);
            }

            // Delete additions that overlap
            // Additions are sorted by from position and after that by length, we want to keep longer additions
            matches = VirtualMatch.filterOverlapping(matches, this.settings.onlyLinkOnce, excludedIntervalTree);

            // Keep only the first identical virtual link per line to avoid
            // clutter when the same term repeats several times in a sentence.
            matches = VirtualMatch.filterDuplicateLineMatches(
                matches,
                (match) => view.state.doc.lineAt(match.from).number,
                duplicateLineMatchKeys,
            );

            // Store the files that are linked by a virtual link
            matches.forEach((addition) => addition.files.forEach((f) => alreadyLinkedFiles.add(f)));

            // Get the cursor position
            const cursorPos = view.state.selection.main.from;

            // Settings if we want to adapt links in the current line / fix IME problem
            const excludeLine = viewIsActive && this.settings.excludeLinksInCurrentLine;
            const fixIMEProblem = viewIsActive && this.settings.fixIMEProblem;
            let needImeFix = false;

            // Get the line start and end positions if we want to exclude links in the current line
            // or if we want to fix the IME problem
            const lineStart = view.state.doc.lineAt(cursorPos).from;
            const lineEnd = view.state.doc.lineAt(cursorPos).to;

            // Collect all decorations so we can sort them before adding to builder
            // (builder requires strictly ascending `from` positions).
            type DecoSpec = { from: number; to: number; deco: Decoration };
            const decoSpecs: DecoSpec[] = [];

            // Determine whether highlight decorations should be added for this view.
            const currentFilePath = sourceFile?.path;
            const highlightText = currentFilePath
                ? (this.highlightService?.getActive(currentFilePath) ?? null)
                : null;
            const highlightTextLower = highlightText?.toLowerCase() ?? null;
            const fmEndOffset = sourceFile
                ? (this.app.metadataCache.getFileCache(sourceFile)?.frontmatterPosition?.end.offset ?? -1)
                : -1;

            type WidgetAddition = { match: VirtualMatch; from: number; to: number; syntaxClasses: string[] };

            const widgetAdditions: WidgetAddition[] = [];

            matches.forEach((addition) => {
                const [from, to] = [addition.from, addition.to];
                const cursorNearby = cursorPos >= from - 0 && cursorPos <= to + 0;

                const additionIsInCurrentLine = from >= lineStart && to <= lineEnd;

                if (fixIMEProblem) {
                    needImeFix = true;
                    if (additionIsInCurrentLine && cursorPos > to) {
                        const gapString = view.state.sliceDoc(to, cursorPos);
                        const strBeforeAdd = view.state.sliceDoc(lineStart, from);

                        // Regex to check if a part of a word is at the line start, because IME problem only occurs at line start
                        // Regex matches parts that:
                        // - are completely empty or contain only whitespace.
                        // - start with a hyphen followed by one or more spaces.
                        // - start with 1 to 6 hash symbols followed by a space.
                        // - start with one or more greater-than signs followed by optional whitespace.
                        // - start with a hyphen followed by one or more spaces, then 1 to 6 hash symbols, and then one or more spaces.
                        // - start with a greater-than sign followed by a space, an exclamation mark within square brackets containing word characters or hyphens, an optional plus or minus sign, and one or more spaces.
                        const regAddInLineStart =
                            /(^\s*$)|(^\s*- +$)|(^\s*#{1,6} $)|(^\s*>+ *$)|(^\s*- +#{1,6} +$)|(^\s*> \[![\w-]+\][+-]? +$)/;

                        // check add is at line start
                        if (!regAddInLineStart.test(strBeforeAdd)) {
                            needImeFix = false;
                        }
                        // check the string between addition and cursorPos, check if it might be IME on.
                        else {
                            const regStrMayIMEon = /^[a-zA-Z]+[a-zA-Z' ]*[a-zA-Z]$|^[a-zA-Z]$/;
                            if (!regStrMayIMEon.test(gapString) || /[' ]{2}/.test(gapString)) {
                                needImeFix = false;
                            }
                        }
                    } else {
                        needImeFix = false;
                    }
                }

                if (!cursorNearby && !needImeFix && !(excludeLine && additionIsInCurrentLine)) {
                    widgetAdditions.push({
                        match: addition,
                        from,
                        to,
                        syntaxClasses: collectVirtualLinkSyntaxClasses(view, from, to),
                    });
                }
            });

            const highlightedVirtualLinkTexts = new Map<string, string>();

            if (highlightTextLower && highlightText) {
                const firstHighlightableWidgetByLine = new Map<number, { addition: WidgetAddition; matchIndex: number }>();
                for (const widgetAddition of widgetAdditions) {
                    if (fmEndOffset >= 0 && widgetAddition.from <= fmEndOffset) continue;

                    const widgetMatch = findFirstMatch(widgetAddition.match.originText, highlightText);
                    if (!widgetMatch) continue;

                    const lineNumber = view.state.doc.lineAt(widgetAddition.from).number;
                    const widgetPosition = widgetAddition.from + widgetMatch.index;
                    const existing = firstHighlightableWidgetByLine.get(lineNumber);
                    if (!existing || widgetPosition < existing.addition.from + existing.matchIndex) {
                        firstHighlightableWidgetByLine.set(lineNumber, {
                            addition: widgetAddition,
                            matchIndex: widgetMatch.index,
                        });
                    }
                }

                const startLineNumber = view.state.doc.lineAt(from).number;
                const lines = text.split('\n');
                let lineOffset = 0;

                for (let i = 0; i < lines.length; i++) {
                    const lineText = lines[i];
                    const lineNumber = startLineNumber + i;
                    const lineStartOffset = from + lineOffset;
                    lineOffset += lineText.length + 1;

                    if (highlightedLineNumbers.has(lineNumber)) continue;

                    const widgetCandidate = firstHighlightableWidgetByLine.get(lineNumber) ?? null;
                    const widgetPosition = widgetCandidate
                        ? widgetCandidate.addition.from + widgetCandidate.matchIndex
                        : null;
                    const plainMatch = findFirstMatch(lineText, highlightText);
                    const plainFrom = plainMatch ? lineStartOffset + plainMatch.index : null;
                    const plainTo = plainMatch && plainFrom != null ? plainFrom + plainMatch.matchText.length : null;

                    if (widgetCandidate && (plainFrom == null || widgetPosition == null || widgetPosition <= plainFrom)) {
                        highlightedVirtualLinkTexts.set(
                            `${widgetCandidate.addition.from}-${widgetCandidate.addition.to}`,
                            highlightText,
                        );
                        highlightedLineNumbers.add(lineNumber);
                        continue;
                    }

                    if (plainFrom == null || plainTo == null) continue;
                    if (fmEndOffset >= 0 && plainFrom <= fmEndOffset) continue;

                    decoSpecs.push({
                        from: plainFrom,
                        to: plainTo,
                        deco: Decoration.mark({ class: 'virtual-autolink-highlight' }),
                    });
                    highlightedLineNumbers.add(lineNumber);
                }
            }

            for (const widgetAddition of widgetAdditions) {
                const key = `${widgetAddition.from}-${widgetAddition.to}`;
                decoSpecs.push({
                    from: widgetAddition.from,
                    to: widgetAddition.to,
                    deco: Decoration.replace({
                        widget: new VirtualLinkWidget(
                            widgetAddition.match,
                            highlightedVirtualLinkTexts.get(key) ?? null,
                            widgetAddition.syntaxClasses,
                        ),
                    }),
                });
            }

            // Sort all decoration specs by ascending `from` (then `to`) before
            // adding to the builder, as required by CM6.
            decoSpecs.sort((a, b) => a.from !== b.from ? a.from - b.from : a.to - b.to);
            for (const { from: f, to: t, deco } of decoSpecs) {
                builder.add(f, t, deco);
            }
        }

        return builder.finish();
    }
}

const pluginSpec: PluginSpec<VirtualAutoLinkerPlugin> = {
    decorations: (value: VirtualAutoLinkerPlugin) => value.decorations,
};

export const liveLinkerPlugin = (
    app: App,
    settings: LinkerPluginSettings,
    updateManager: ExternalUpdateManager,
    highlightService: HighlightService | null = null
) => {
    return ViewPlugin.define((editorView: EditorView) => {
        return new VirtualAutoLinkerPlugin(editorView, app, settings, updateManager, highlightService);
    }, pluginSpec);
};

import { App, getLinkpath, MarkdownPostProcessorContext, MarkdownRenderChild, TFile } from 'obsidian';

import { LinkerPluginSettings } from '../main';
import { SectionSourceMapper } from './highlightService';
import { LinkerCache, PrefixTree } from './linkerCache';
import { VirtualMatch } from './virtualLinkDom';

export class GlossaryLinker extends MarkdownRenderChild {
    text: string;
    ctx: MarkdownPostProcessorContext;
    app: App;
    settings: LinkerPluginSettings;
    linkerCache: LinkerCache;

    constructor(app: App, settings: LinkerPluginSettings, context: MarkdownPostProcessorContext, containerEl: HTMLElement) {
        super(containerEl);
        this.settings = settings;
        this.app = app;
        this.ctx = context;

        this.linkerCache = LinkerCache.getInstance(app, settings);

        // TODO: Fix this?
        // If not called, sometimes (especially for lists) elements are added to the context after they already have been loaded
        // within the parent element. This causes the already added links to be removed...?
        this.load();
    }


    onload() {
        if (!this.settings.linkerActivated) {
            return;
        }

        // Include common inline formatting containers so virtual links still
        // render inside highlighted and struck-through text in reading mode.
        const tags = ['p', 'li', 'td', 'th', 'span', 'mark', 'em', 'strong', 'del', 's']; //"div"
        if (this.settings.includeHeaders) {
            tags.push('h1', 'h2', 'h3', 'h4', 'h5', 'h6');
        }

        // TODO: Onload is called on the divs separately, so this sets are not stored between divs
        // Since divs can be rendered in arbitrary order, storing information about already linked files is not easy
        // Maybe there is a good and performant solution to this problem
        const linkedFiles = new Set<TFile>();
        const explicitlyLinkedFiles = new Set<TFile>();
        const duplicateLineMatchKeys = new Set<string>();
        const sectionInfo = this.ctx.getSectionInfo(this.containerEl);
        const sectionSourceMapper = sectionInfo
            ? new SectionSourceMapper(sectionInfo.text, sectionInfo.lineStart)
            : null;

        if (this.settings.excludeLinksToRealLinkedFiles) {
            const realLinks = this.containerEl.querySelectorAll('a.internal-link[href]');
            realLinks.forEach((link) => {
                if (!(link instanceof HTMLAnchorElement)) {
                    return;
                }

                const href = link.getAttribute('data-href') || link.getAttribute('href') || '';
                const linkPath = getLinkpath(href.split('#')[0]);
                if (!linkPath) {
                    return;
                }

                const linkedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, this.ctx.sourcePath);
                if (linkedFile) {
                    explicitlyLinkedFiles.add(linkedFile);
                }
            });
        }

        for (const tag of tags) {
            const nodeList = this.containerEl.getElementsByTagName(tag);
            for (let index = 0; index <= nodeList.length; index++) {
                const item = index == nodeList.length ? this.containerEl : nodeList.item(index);
                if (!item) continue;

                for (let childNodeIndex = 0; childNodeIndex < item.childNodes.length; childNodeIndex++) {
                    const childNode = item.childNodes[childNodeIndex];

                    if (childNode.nodeType === Node.TEXT_NODE) {
                        const text = childNode.textContent || '';
                        if (text.length === 0) continue;

                        const mappedStart = sectionSourceMapper?.locate(text) ?? null;

                        this.linkerCache.reset();
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
                                const currentNodes = this.linkerCache.cache.getCurrentMatchNodes(i, this.ctx.sourcePath);
                                if (currentNodes.length > 0) {
                                    currentNodes.forEach((node) => {
                                        // Check if we want to include this note based on the settings
                                        if (!this.settings.matchAnyPartsOfWords) {
                                            if (
                                                this.settings.matchBeginningOfWords &&
                                                !node.startsAtWordBoundary &&
                                                this.settings.matchEndOfWords &&
                                                !isWordBoundary
                                            ) {
                                                return;
                                            }
                                        }

                                        const nFrom = node.start;
                                        const nTo = node.end;
                                        const name = text.slice(nFrom, nTo);

                                        matches.push(
                                            new VirtualMatch(
                                                id++,
                                                name,
                                                nFrom,
                                                nTo,
                                                Array.from(node.files),
                                                node.isAlias,
                                                !isWordBoundary,
                                                this.settings
                                            )
                                        );
                                    });
                                }
                            }

                            // Push the char to get the next nodes in the prefix tree
                            this.linkerCache.cache.pushChar(char);
                            i += char.length;
                        }

                        // Sort additions by from position
                        matches = VirtualMatch.sort(matches);

                        // Delete additions that links to already linked files
                        if (this.settings.excludeLinksToRealLinkedFiles) {
                            matches = VirtualMatch.filterAlreadyLinked(matches, explicitlyLinkedFiles);
                        }

                        // Delete additions that links to already linked files
                        if (this.settings.onlyLinkOnce) {
                            matches = VirtualMatch.filterAlreadyLinked(matches, linkedFiles);
                        }
                        // Delete additions that overlap
                        // Additions are sorted by from position and after that by length, we want to keep longer additions
                        matches = VirtualMatch.filterOverlapping(matches, this.settings.onlyLinkOnce);

                        // Keep only the first identical virtual link per source
                        // line across the whole rendered section.
                        matches = VirtualMatch.filterDuplicateLineMatches(
                            matches,
                            (match) => {
                                if (mappedStart != null && sectionSourceMapper) {
                                    return sectionSourceMapper.lineNumberAt(mappedStart + match.from);
                                }
                                return (text.slice(0, match.from).match(/\n/g) ?? []).length;
                            },
                            duplicateLineMatchKeys,
                        );

                        const parent = childNode.parentElement;
                        let lastTo = 0;

                        matches.forEach((match) => {
                            match.files.forEach((f) => linkedFiles.add(f));

                            const span = match.getCompleteLinkElement();

                            if (match.from > 0) {
                                parent?.insertBefore(document.createTextNode(text.slice(lastTo, match.from)), childNode);
                            }

                            parent?.insertBefore(span, childNode);
                            lastTo = match.to;
                        });

                        const textLength = text.length;
                        if (lastTo < textLength) {
                            parent?.insertBefore(document.createTextNode(text.slice(lastTo)), childNode);
                        }
                        parent?.removeChild(childNode);
                        childNodeIndex += 1;
                    }
                }
            }
        }
    }
}

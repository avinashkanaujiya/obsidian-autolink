import IntervalTree from '@flatten-js/interval-tree';
import { LinkerPluginSettings } from 'main';
import { TFile } from 'obsidian';
import { findFirstMatch } from './highlightService';

const OPEN_ALL_LABEL = 'oa';

export class VirtualMatch {
    constructor(
        public id: number,
        public originText: string,
        public from: number,
        public to: number,
        public files: TFile[],
        public isAlias: boolean,
        public isSubWord: boolean,
        public settings: LinkerPluginSettings
    ) {}

    /////////////////////////////////////////////////
    // DOM methods
    /////////////////////////////////////////////////

    getCompleteLinkElement(highlightText: string | null = null, extraClasses: string[] = [], ownerDoc: Document = document) {
        const span = this.getLinkRootSpan(extraClasses, ownerDoc);
        const firstPath = this.files.length > 0 ? this.files[0].path : '';
        const primaryLink = this.getLinkAnchorElement(this.originText, firstPath, highlightText, ownerDoc);
        if (this.files.length > 1) {
            primaryLink.setAttribute('data-open-all-paths', JSON.stringify(this.files.map((file) => file.path)));
        }
        span.appendChild(primaryLink);
        if (this.files.length > 1) {
            span.appendChild(this.getMultipleReferencesSpan(ownerDoc));
        }

        if (!this.isSubWord || !this.settings.suppressSuffixForSubWords) {
            const icon = this.getIconSpan(ownerDoc);
            if (icon) span.appendChild(icon);
        }
        return span;
    }

    getLinkAnchorElement(linkText: string, href: string, highlightText: string | null = null, ownerDoc: Document = document) {
        const link = ownerDoc.createElement('a');
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.setAttribute('from', this.from.toString());
        link.setAttribute('to', this.to.toString());
        link.setAttribute('origin-text', this.originText);
        link.classList.add('internal-link', 'virtual-link-a');

        const highlightMatch = highlightText ? findFirstMatch(linkText, highlightText) : null;
        if (!highlightMatch) {
            link.textContent = linkText;
            return link;
        }

        if (highlightMatch.index > 0) {
            link.appendChild(ownerDoc.createTextNode(linkText.slice(0, highlightMatch.index)));
        }

        const mark = ownerDoc.createElement('span');
        mark.classList.add('virtual-autolink-highlight');
        mark.textContent = highlightMatch.matchText;
        link.appendChild(mark);

        const afterIndex = highlightMatch.index + highlightMatch.matchText.length;
        if (afterIndex < linkText.length) {
            link.appendChild(ownerDoc.createTextNode(linkText.slice(afterIndex)));
        }

        return link;
    }

    getOpenAllAnchorElement(ownerDoc: Document = document) {
        const link = ownerDoc.createElement('a');
        const firstPath = this.files[0]?.path ?? '';
        link.href = firstPath;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.setAttribute('origin-text', this.originText);
        link.setAttribute('data-open-all-paths', JSON.stringify(this.files.map((file) => file.path)));
        link.setAttribute('aria-label', 'Open all linked notes');
        link.classList.add('internal-link', 'virtual-link-open-all');
        link.textContent = ` ${OPEN_ALL_LABEL} `;
        return link;
    }

    getLinkRootSpan(extraClasses: string[] = [], ownerDoc: Document = document) {
        const span = ownerDoc.createElement('span');
        span.classList.add('glossary-entry', 'virtual-link', 'virtual-link-span');
        if (extraClasses.length > 0) {
            span.classList.add(...extraClasses);
        }
        if (this.settings.applyDefaultLinkStyling) {
            span.classList.add('virtual-link-default');
        }
        return span;
    }

    getMultipleReferencesSpan(ownerDoc: Document = document) {
        const spanReferences = ownerDoc.createElement('span');
        if (!this.settings.alwaysShowMultipleReferences) {
            spanReferences.classList.add('multiple-files-references');
        }

        const items: HTMLAnchorElement[] = [this.getOpenAllAnchorElement(ownerDoc)];
        this.files.forEach((file, index) => {
            items.push(this.getLinkAnchorElement(` ${index + 1} `, file.path, null, ownerDoc));
        });

        const openingBracket = ownerDoc.createElement('span');
        openingBracket.textContent = this.isSubWord ? '[' : ' [';
        spanReferences.appendChild(openingBracket);

        items.forEach((item, index) => {
            spanReferences.appendChild(item);
            if (index < items.length - 1) {
                spanReferences.appendChild(ownerDoc.createTextNode('|'));
            }
        });

        const closingBracket = ownerDoc.createElement('span');
        closingBracket.textContent = ']';
        spanReferences.appendChild(closingBracket);

        return spanReferences;
    }

    getIconSpan(ownerDoc: Document = document) {
        const suffix = this.isAlias ? this.settings.virtualLinkAliasSuffix : this.settings.virtualLinkSuffix;
        if ((suffix?.length ?? 0) > 0) {
            const icon = ownerDoc.createElement('sup');
            icon.textContent = suffix;
            icon.classList.add('linker-suffix-icon');
            return icon;
        }
        return null;
    }

    /////////////////////////////////////////////////
    // Filter and sort methods
    /////////////////////////////////////////////////

    static compare(this: void, a: VirtualMatch, b: VirtualMatch): number {
        if (a.from === b.from) {
            if (b.to == a.to) {
                return b.files.length - a.files.length;
            }
            return b.to - a.to;
        }
        return a.from - b.from;
    }

    static sort(matches: VirtualMatch[]): VirtualMatch[] {
        return Array.from(matches).sort(VirtualMatch.compare);
    }

    static filterAlreadyLinked(matches: VirtualMatch[], linkedFiles: Set<TFile>, mode: 'some' | 'every' = 'every'): VirtualMatch[] {
        return matches.filter((match) => {
            if (mode === 'every') {
                return !match.files.every((file) => linkedFiles.has(file));
            } else {
                return !match.files.some((file) => linkedFiles.has(file));
            }
        });
    }

    static filterOverlapping(matches: VirtualMatch[], onlyLinkOnce = true, excludedIntervalTree?: IntervalTree): VirtualMatch[] {
        const matchesToDelete: Map<number, boolean> = new Map();

        // Delete additions that overlap
        // Additions are sorted by from position and after that by length, we want to keep longer additions
        for (let i = 0; i < matches.length; i++) {
            const addition = matches[i];
            if (matchesToDelete.has(addition.id)) {
                continue;
            }

            // Check if the addition is inside an excluded block
            if (excludedIntervalTree) {
                const overlaps = excludedIntervalTree.search([addition.from, addition.to]);
                if (overlaps.length > 0) {
                    matchesToDelete.set(addition.id, true);
                    continue;
                }
            }

            // Set all overlapping additions to be deleted
            for (let j = i + 1; j < matches.length; j++) {
                const otherAddition = matches[j];
                if (otherAddition.from >= addition.to) {
                    break;
                }
                matchesToDelete.set(otherAddition.id, true);
            }

            // Set all additions that link to the same file to be deleted
            if (onlyLinkOnce) {
                for (let j = i + 1; j < matches.length; j++) {
                    const otherAddition = matches[j];
                    if (matchesToDelete.has(otherAddition.id)) {
                        continue;
                    }

                    if (otherAddition.files.every((f) => addition.files.includes(f))) {
                        matchesToDelete.set(otherAddition.id, true);
                    }
                }
            }
        }
        return matches.filter((match) => !matchesToDelete.has(match.id));
    }

    static filterDuplicateLineMatches(
        matches: VirtualMatch[],
        getLineNumber: (match: VirtualMatch) => number,
        seenKeys: Set<string> = new Set(),
    ): VirtualMatch[] {
        return matches.filter((match) => {
            const fileKey = match.files
                .map((file) => file.path)
                .sort()
                .join('|');
            const key = `${getLineNumber(match)}::${match.originText.toLocaleLowerCase()}::${fileKey}`;
            if (seenKeys.has(key)) {
                return false;
            }
            seenKeys.add(key);
            return true;
        });
    }
}

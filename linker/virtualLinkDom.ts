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

    getCompleteLinkElement(highlightText: string | null = null, extraClasses: string[] = []) {
        const span = this.getLinkRootSpan(extraClasses);
        const firstPath = this.files.length > 0 ? this.files[0].path : '';
        const primaryLink = this.getLinkAnchorElement(this.originText, firstPath, highlightText);
        if (this.files.length > 1) {
            primaryLink.setAttribute('data-open-all-paths', JSON.stringify(this.files.map((file) => file.path)));
        }
        span.appendChild(primaryLink);
        if (this.files.length > 1) {
            span.appendChild(this.getMultipleReferencesSpan());
        }

        if (!this.isSubWord || !this.settings.suppressSuffixForSubWords) {
            const icon = this.getIconSpan();
            if (icon) span.appendChild(icon);
        }
        return span;
    }

    getLinkAnchorElement(linkText: string, href: string, highlightText: string | null = null) {
        const link = document.createElement('a');
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
            link.appendChild(document.createTextNode(linkText.slice(0, highlightMatch.index)));
        }

        const mark = document.createElement('span');
        mark.classList.add('autolink-highlight');
        mark.textContent = highlightMatch.matchText;
        link.appendChild(mark);

        const afterIndex = highlightMatch.index + highlightMatch.matchText.length;
        if (afterIndex < linkText.length) {
            link.appendChild(document.createTextNode(linkText.slice(afterIndex)));
        }

        return link;
    }

    getOpenAllAnchorElement() {
        const link = document.createElement('a');
        link.href = this.files[0]?.path ?? '';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.setAttribute('origin-text', this.originText);
        link.setAttribute('data-open-all-paths', JSON.stringify(this.files.map((file) => file.path)));
        link.setAttribute('aria-label', 'Open all linked notes');
        link.classList.add('internal-link', 'virtual-link-open-all');
        link.textContent = ` ${OPEN_ALL_LABEL} `;
        return link;
    }

    getLinkRootSpan(extraClasses: string[] = []) {
        const span = document.createElement('span');
        span.classList.add('glossary-entry', 'virtual-link', 'virtual-link-span');
        if (extraClasses.length > 0) {
            span.classList.add(...extraClasses);
        }
        if (this.settings.applyDefaultLinkStyling) {
            span.classList.add('virtual-link-default');
        }
        return span;
    }

    getMultipleReferencesSpan() {
        const spanReferences = document.createElement('span');
        if (!this.settings.alwaysShowMultipleReferences) {
            spanReferences.classList.add('multiple-files-references');
        }

        const items: HTMLAnchorElement[] = [this.getOpenAllAnchorElement()];
        this.files.forEach((file, index) => {
            items.push(this.getLinkAnchorElement(` ${index + 1} `, file.path));
        });

        const openingBracket = document.createElement('span');
        openingBracket.textContent = this.isSubWord ? '[' : ' [';
        spanReferences.appendChild(openingBracket);

        items.forEach((item, index) => {
            spanReferences.appendChild(item);
            if (index < items.length - 1) {
                spanReferences.appendChild(document.createTextNode('|'));
            }
        });

        const closingBracket = document.createElement('span');
        closingBracket.textContent = ']';
        spanReferences.appendChild(closingBracket);

        return spanReferences;
    }

    getIconSpan() {
        const suffix = this.isAlias ? this.settings.virtualLinkAliasSuffix : this.settings.virtualLinkSuffix;
        if ((suffix?.length ?? 0) > 0) {
            const icon = document.createElement('sup');
            icon.textContent = suffix;
            icon.classList.add('linker-suffix-icon');
            return icon;
        }
        return null;
    }

    /////////////////////////////////////////////////
    // Filter and sort methods
    /////////////////////////////////////////////////

    static compare(a: VirtualMatch, b: VirtualMatch): number {
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

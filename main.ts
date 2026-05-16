import { App, EditorPosition, Keymap, MarkdownView, Menu, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, TFolder } from 'obsidian';

import { GlossaryLinker } from './linker/readModeLinker';
import { liveLinkerPlugin } from './linker/liveLinker';
import { ExternalUpdateManager, LinkerCache } from 'linker/linkerCache';
import { LinkerMetaInfoFetcher, normalizeDirectorySetting } from 'linker/linkerInfo';
import { HighlightService, applyHighlightToDOM } from 'linker/highlightService';
import { HighlightView, HIGHLIGHT_VIEW_TYPE } from 'linker/highlightView';

export interface LinkerPluginSettings {
    advancedSettings: boolean;
    linkerActivated: boolean;
    suppressSuffixForSubWords: boolean;
    matchAnyPartsOfWords: boolean;
    matchEndOfWords: boolean;
    matchBeginningOfWords: boolean;
    includeAllFiles: boolean;
    linkerDirectories: string[];
    excludedDirectories: string[];
    excludedDirectoriesForLinking: string[];
    virtualLinkSuffix: string;
    virtualLinkAliasSuffix: string;
    useDefaultLinkStyleForConversion: boolean;
    defaultUseMarkdownLinks: boolean; // Otherwise wiki links
    defaultLinkFormat: 'shortest' | 'relative' | 'absolute';
    useMarkdownLinks: boolean;
    linkFormat: 'shortest' | 'relative' | 'absolute';
    applyDefaultLinkStyling: boolean;
    includeHeaders: boolean;
    matchCaseSensitive: boolean;
    capitalLetterProportionForAutomaticMatchCase: number;
    tagToIgnoreCase: string;
    tagToMatchCase: string;
    propertyNameToMatchCase: string;
    propertyNameToIgnoreCase: string;
    tagToExcludeFile: string;
    tagToIncludeFile: string;
    excludeLinksToOwnNote: boolean;
    fixIMEProblem: boolean;
    excludeLinksInCurrentLine: boolean;
    onlyLinkOnce: boolean;
    excludeLinksToRealLinkedFiles: boolean;
    includeAliases: boolean;
    customFrontmatterFields: string[];
    alwaysShowMultipleReferences: boolean;
    // wordBoundaryRegex: string;
    // conversionFormat
}

const DEFAULT_SETTINGS: LinkerPluginSettings = {
    advancedSettings: false,
    linkerActivated: true,
    matchAnyPartsOfWords: false,
    matchEndOfWords: true,
    matchBeginningOfWords: true,
    suppressSuffixForSubWords: false,
    includeAllFiles: true,
    linkerDirectories: ['Glossary'],
    excludedDirectories: [],
    excludedDirectoriesForLinking: [],
    virtualLinkSuffix: '🔗',
    virtualLinkAliasSuffix: '🔗',
    useMarkdownLinks: false,
    linkFormat: 'shortest',
    defaultUseMarkdownLinks: false,
    defaultLinkFormat: 'shortest',
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
    // wordBoundaryRegex: '/[\t- !-/:-@\[-`{-~\p{Emoji_Presentation}\p{Extended_Pictographic}]/u',
};

function normalizeVaultPath(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
}

function getVaultDirname(filePath: string): string {
    const normalized = normalizeVaultPath(filePath);
    const lastSlashIndex = normalized.lastIndexOf('/');
    return lastSlashIndex === -1 ? '' : normalized.slice(0, lastSlashIndex);
}

function getVaultBasename(filePath: string): string {
    const normalized = normalizeVaultPath(filePath);
    const lastSlashIndex = normalized.lastIndexOf('/');
    return lastSlashIndex === -1 ? normalized : normalized.slice(lastSlashIndex + 1);
}

function getRelativeDirectoryPath(sourceDir: string, targetDir: string): string {
    const sourceParts = sourceDir.length > 0 ? sourceDir.split('/') : [];
    const targetParts = targetDir.length > 0 ? targetDir.split('/') : [];

    let sharedIndex = 0;
    while (
        sharedIndex < sourceParts.length &&
        sharedIndex < targetParts.length &&
        sourceParts[sharedIndex] === targetParts[sharedIndex]
    ) {
        sharedIndex += 1;
    }

    const parentParts = sourceParts.slice(sharedIndex).map(() => '..');
    const childParts = targetParts.slice(sharedIndex);
    return [...parentParts, ...childParts].join('/');
}

export function buildRelativeVaultPath(sourceFilePath: string, targetFilePath: string): string {
    const sourceDir = getVaultDirname(sourceFilePath);
    const targetDir = getVaultDirname(targetFilePath);
    const targetBase = getVaultBasename(targetFilePath);
    const relativeDir = getRelativeDirectoryPath(sourceDir, targetDir);
    return relativeDir.length > 0 ? `${relativeDir}/${targetBase}` : targetBase;
}

export function normalizeFrontmatterTags(tags: unknown): string[] {
    if (typeof tags === 'string') {
        const normalizedTag = tags.trim();
        return normalizedTag.length > 0 ? [normalizedTag] : [];
    }

    if (!Array.isArray(tags)) {
        return [];
    }

    return tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
}

function matchesFolderSetting(directorySetting: string, folder: TFolder): boolean {
    const normalizedSetting = normalizeDirectorySetting(directorySetting);
    return (
        normalizedSetting === normalizeDirectorySetting(folder.path) ||
        normalizedSetting === normalizeDirectorySetting(folder.name)
    );
}

function isMarkdownFileOrFolder(file: TAbstractFile): boolean {
    return file instanceof TFolder || (file instanceof TFile && file.extension === 'md');
}

type VirtualLinkAnchor = {
    getAttribute(name: string): string | null;
};

type ClosestCapableElement = {
    closest(selector: string): unknown;
    parentElement?: unknown;
};

function getClosestCapableElement(target: EventTarget | null): ClosestCapableElement | null {
    const candidate = target as unknown as ClosestCapableElement | null;
    if (candidate && typeof candidate.closest === 'function') {
        return candidate;
    }

    const parentElement = candidate?.parentElement;
    if (parentElement && typeof (parentElement as ClosestCapableElement).closest === 'function') {
        return parentElement as ClosestCapableElement;
    }

    return null;
}

function resolveVirtualLinkAnchor(target: EventTarget | null): VirtualLinkAnchor | null {
    const element = getClosestCapableElement(target);
    if (!element) return null;

    const directAnchor = element.closest('.virtual-link-a');
    if (directAnchor && typeof (directAnchor as VirtualLinkAnchor).getAttribute === 'function') {
        return directAnchor as VirtualLinkAnchor;
    }

    const widget = element.closest('.virtual-link-span') as { querySelector?(selector: string): unknown } | null;
    if (!widget || typeof widget.querySelector !== 'function') {
        return null;
    }

    const firstAnchor = widget.querySelector('.virtual-link-a');
    return firstAnchor && typeof (firstAnchor as VirtualLinkAnchor).getAttribute === 'function'
        ? firstAnchor as VirtualLinkAnchor
        : null;
}

export async function handleVirtualLinkClickEvent(
    app: App,
    highlightService: HighlightService,
    e: MouseEvent,
): Promise<void> {
    if (e.button !== 0) return;

    const anchor = resolveVirtualLinkAnchor(e.target);
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    const searchText = anchor.getAttribute('origin-text');
    if (searchText) {
        highlightService.setPending(href, searchText);
    }

    e.preventDefault();
    e.stopPropagation();

    const sourcePath = app.workspace.getActiveFile()?.path ?? '';
    await app.workspace.openLinkText(href, sourcePath, Keymap.isModEvent(e));
}

export default class LinkerPlugin extends Plugin {
    settings: LinkerPluginSettings;
    updateManager = new ExternalUpdateManager();
    highlightService = new HighlightService();
    private cacheRefreshTimer: ReturnType<typeof setTimeout> | null = null;

    async onload() {
        await this.loadSettings();

        // Register the glossary linker for the read mode.
        // The second post-processor applies highlight marks for notes opened
        // via a virtual-link click.
        this.registerMarkdownPostProcessor((element, context) => {
            context.addChild(new GlossaryLinker(this.app, this.settings, context, element));
        });

        this.registerMarkdownPostProcessor((element, context) => {
            const searchText = this.highlightService.getActive(context.sourcePath);
            if (searchText) applyHighlightToDOM(element, searchText);
        });

        // Register the live linker for the live edit mode
        this.registerEditorExtension(liveLinkerPlugin(this.app, this.settings, this.updateManager, this.highlightService));

        // Register the right-sidebar highlights panel
        this.registerView(
            HIGHLIGHT_VIEW_TYPE,
            (leaf) => new HighlightView(leaf, this.highlightService)
        );

        // This adds a settings tab so the user can configure various aspects of the plugin
        this.addSettingTab(new LinkerSettingTab(this.app, this));

        // Context menu item to convert virtual links to real links
        this.registerEvent(this.app.workspace.on('file-menu', (menu, file, source) => this.addContextMenuItem(menu, file, source)));

        // ----------------------------------------------------------------
        // Display-text highlight: intercept virtual-link activation.
        // We use mousedown in the capture phase because CodeMirror can prevent
        // the first click from firing when a pane is focused or rerendered,
        // which manifests as “sometimes needs two clicks”. Handling the event
        // earlier makes navigation deterministic for both read mode and live
        // preview widgets.
        // ----------------------------------------------------------------
        this.registerDomEvent(document, 'mousedown', (e: MouseEvent) => {
            void handleVirtualLinkClickEvent(this.app, this.highlightService, e);
        }, true /* capture */);

        // Promote pending highlight when the target file opens and apply it.
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (!file) return;

                const searchText = this.highlightService.activateForFile(file.path);
                if (!searchText) return;

                // Trigger a CM6 re-render so live-preview gets the decorations.
                this.updateManager.update();

                // Open / reveal the sidebar panel so the user can jump to any
                // occurrence even when the automatic scroll misses on long notes.
                this.revealHighlightSidebar();

                // Apply marks to already-rendered reading-mode DOM (for notes
                // that were already open in another leaf when the link was clicked).
                // For freshly opened notes the reading-mode post-processor handles
                // mark injection; this path handles the tab-switch case.
                requestAnimationFrame(() => {
                    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                    if (!view || view.file?.path !== file.path) return;

                    // Prefer the internal previewMode container; fall back to
                    // well-known CSS classes so we never apply to toolbar DOM.
                    const readingEl: HTMLElement | null =
                        view.previewMode?.containerEl ??
                        view.contentEl.querySelector('.markdown-reading-view') ??
                        view.contentEl.querySelector('.markdown-preview-view');

                    if (readingEl instanceof HTMLElement) {
                        applyHighlightToDOM(readingEl, searchText);
                    }
                });

                // Scroll to the first highlighted occurrence.  We poll every
                // 200 ms instead of a fixed delay so we adapt to varying render
                // times (fast machine: done at 200 ms; slow / large note: might
                // need a few retries).  Cap at 10 attempts (~2 s total).
                this.attemptScroll(file.path, searchText, 0);
            })
        );

        // Remove stale highlights for notes that have been closed.
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                const openPaths = new Set<string>();
                this.app.workspace.iterateAllLeaves(leaf => {
                    if (leaf.view instanceof MarkdownView && leaf.view.file) {
                        openPaths.add(leaf.view.file.path);
                    }
                });
                this.highlightService.clearStale(openPaths);
            })
        );

        this.registerEvent(
            this.app.vault.on('create', (file) => {
                if (isMarkdownFileOrFolder(file)) {
                    this.scheduleCacheRefresh();
                }
            })
        );

        this.registerEvent(
            this.app.vault.on('delete', (file) => {
                if (isMarkdownFileOrFolder(file)) {
                    this.scheduleCacheRefresh();
                }
            })
        );

        this.registerEvent(
            this.app.vault.on('rename', (file) => {
                if (isMarkdownFileOrFolder(file)) {
                    this.scheduleCacheRefresh();
                }
            })
        );

        this.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                if (file instanceof TFile) {
                    this.scheduleCacheRefresh();
                }
            })
        );

        this.addCommand({
            id: 'activate-virtual-linker',
            name: 'Activate Virtual Linker',
            checkCallback: (checking) => {
                if (!this.settings.linkerActivated) {
                    if (!checking) {
                        void this.updateSettings({ linkerActivated: true });
                    }
                    return true;
                }
                return false;
            },
        });

        this.addCommand({
            id: 'deactivate-virtual-linker',
            name: 'Deactivate Virtual Linker',
            checkCallback: (checking) => {
                if (this.settings.linkerActivated) {
                    if (!checking) {
                        void this.updateSettings({ linkerActivated: false });
                    }
                    return true;
                }
                return false;
            },
        });

        this.addCommand({
            id: 'convert-selected-virtual-links',
            name: 'Convert All Virtual Links in Selection to Real Links',
            checkCallback: (checking: boolean) => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                const editor = view?.editor;

                if (!editor || !editor.somethingSelected()) {
                    return false;
                }

                if (checking) return true;

                // Get the selected text range
                const from = editor.getCursor('from');
                const to = editor.getCursor('to');

                // Get the DOM element containing the selection
                const cmEditor = (editor as unknown as { cm?: { dom: ParentNode } }).cm;
                if (!cmEditor) return;

                const selectionRange = cmEditor.dom.querySelector('.cm-content');
                if (!selectionRange) return false;

                // Find all virtual links in the selection
                const virtualLinks = Array.from(selectionRange.querySelectorAll('.virtual-link-a'))
                    .filter((link): link is HTMLElement => link instanceof HTMLElement)
                    .map(link => ({
                        element: link,
                        from: parseInt(link.getAttribute('from') || '-1'),
                        to: parseInt(link.getAttribute('to') || '-1'),
                        text: link.getAttribute('origin-text') || '',
                        href: link.getAttribute('href') || ''
                    }))
                    .filter(link => {
                        const linkFrom = editor.offsetToPos(link.from);
                        const linkTo = editor.offsetToPos(link.to);
                        return this.isPosWithinRange(linkFrom, linkTo, from, to);
                    })
                    .sort((a, b) => a.from - b.from);

                if (virtualLinks.length === 0) return;

                // Process all links in a single operation
                const replacements: {from: number, to: number, text: string}[] = [];

                for (const link of virtualLinks) {
                    const targetFile = this.app.vault.getAbstractFileByPath(link.href);
                    if (!(targetFile instanceof TFile)) continue;

                    const activeFile = this.app.workspace.getActiveFile();
                    if (!activeFile) continue;

                    replacements.push({
                        from: link.from,
                        to: link.to,
                        text: this.buildRealLink(targetFile, activeFile.path, link.text)
                    });
                }

                // Apply all replacements in reverse order to maintain correct positions
                for (const replacement of replacements.reverse()) {
                    const fromPos = editor.offsetToPos(replacement.from);
                    const toPos = editor.offsetToPos(replacement.to);
                    editor.replaceRange(replacement.text, fromPos, toPos);
                }
            }
        });

    }

    private isPosWithinRange(
        linkFrom: EditorPosition,
        linkTo: EditorPosition,
        selectionFrom: EditorPosition,
        selectionTo: EditorPosition
    ): boolean {
        return (
            (linkFrom.line > selectionFrom.line ||
             (linkFrom.line === selectionFrom.line && linkFrom.ch >= selectionFrom.ch)) &&
            (linkTo.line < selectionTo.line ||
             (linkTo.line === selectionTo.line && linkTo.ch <= selectionTo.ch))
        );
    }

    private buildRealLink(targetFile: TFile, sourceFilePath: string, displayText: string): string {
        let absolutePath = targetFile.path;
        let relativePath = buildRelativeVaultPath(sourceFilePath, absolutePath);

        // fileToLinktext depends on the app's link format setting; we compute all variants ourselves
        const replacementPath = this.app.metadataCache.fileToLinktext(targetFile, sourceFilePath);
        const lastPart = replacementPath.split('/').pop() ?? replacementPath;
        const shortestFile = this.app.metadataCache.getFirstLinkpathDest(lastPart, '');
        let shortestPath = shortestFile?.path === targetFile.path ? lastPart : absolutePath;

        if (!replacementPath.endsWith('.md')) {
            if (absolutePath.endsWith('.md')) absolutePath = absolutePath.slice(0, -3);
            if (shortestPath.endsWith('.md')) shortestPath = shortestPath.slice(0, -3);
            if (relativePath.endsWith('.md')) relativePath = relativePath.slice(0, -3);
        }

        const useMarkdownLinks = this.settings.useDefaultLinkStyleForConversion
            ? this.settings.defaultUseMarkdownLinks
            : this.settings.useMarkdownLinks;

        const linkFormat = this.settings.useDefaultLinkStyleForConversion
            ? this.settings.defaultLinkFormat
            : this.settings.linkFormat;

        if (replacementPath === displayText && linkFormat === 'shortest') {
            return `[[${replacementPath}]]`;
        }

        const resolvedPath = linkFormat === 'shortest' ? shortestPath
            : linkFormat === 'relative' ? relativePath
            : absolutePath;

        return useMarkdownLinks
            ? `[${displayText}](${resolvedPath})`
            : `[[${resolvedPath}|${displayText}]]`;
    }

    private scheduleCacheRefresh(): void {
        if (this.cacheRefreshTimer !== null) {
            clearTimeout(this.cacheRefreshTimer);
        }

        this.cacheRefreshTimer = setTimeout(() => {
            this.cacheRefreshTimer = null;
            LinkerCache.getInstance(this.app, this.settings).rebuildCache();
            this.rerenderReadingViews();
            this.updateManager.update();
        }, 75);
    }

    private rerenderReadingViews(): void {
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (!(leaf.view instanceof MarkdownView) || leaf.view.getMode() !== 'preview') {
                return;
            }
            leaf.view.previewMode.rerender(true);
        });
    }

    private async updateFileTags(targetFile: TFile, tagToAdd: string, tagToRemove: string): Promise<boolean> {
        const currentTags = normalizeFrontmatterTags(this.app.metadataCache.getFileCache(targetFile)?.frontmatter?.tags);
        const requiresUpdate = !currentTags.includes(tagToAdd) || currentTags.includes(tagToRemove);
        if (!requiresUpdate) {
            return false;
        }

        await this.app.fileManager.processFrontMatter(targetFile, (frontMatter) => {
            const nextTags = new Set(normalizeFrontmatterTags(frontMatter.tags));
            nextTags.add(tagToAdd);
            nextTags.delete(tagToRemove);
            frontMatter.tags = Array.from(nextTags);
        });

        return true;
    }

    addContextMenuItem(menu: Menu, file: TAbstractFile, source: string) {
        if (!file) {
            return;
        }


        const app: App = this.app;
        const settings = this.settings;

        const fetcher = new LinkerMetaInfoFetcher(app, settings);
        // Check, if the file has the linker-included tag

        const isDirectory = app.vault.getAbstractFileByPath(file.path) instanceof TFolder;

        if (!isDirectory) {
            const metaInfo = fetcher.getMetaInfo(file);

            const contextMenuHandler = (event: MouseEvent) => {
                // Access the element that triggered the context menu
                const targetElement = event.target;

                if (!targetElement || !(targetElement instanceof HTMLElement)) {
                    console.error('No target element');
                    return;
                }

                // Check, if we are clicking on a virtual link inside a note or a note in the file explorer
                const isVirtualLink = targetElement.classList.contains('virtual-link-a');

                const from = parseInt(targetElement.getAttribute('from') || '-1');
                const to = parseInt(targetElement.getAttribute('to') || '-1');

                if (from === -1 || to === -1) {
                    menu.addItem((item) => {
                        // Item to convert a virtual link to a real link
                        item.setTitle(
                            '[Virtual Linker] Converting link is not here.'
                        ).setIcon('link');
                    });
                }
                // Check, if the element has the "virtual-link" class
                else if (isVirtualLink) {
                    menu.addItem((item) => {
                        // Item to convert a virtual link to a real link
                        item.setTitle('[Virtual Linker] Convert to real link')
                            .setIcon('link')
                            .onClick(() => {
                                                                const from = parseInt(targetElement.getAttribute('from') || '-1');
                                const to = parseInt(targetElement.getAttribute('to') || '-1');

                                if (from === -1 || to === -1) {
                                    console.error('[Autolink] No from or to position');
                                    return;
                                }

                                const text = targetElement.getAttribute('origin-text') || '';
                                const activeFile = app.workspace.getActiveFile();
                                if (!activeFile) {
                                    console.error('[Autolink] No active file');
                                    return;
                                }

                                const replacement = this.buildRealLink(file as TFile, activeFile.path, text);

                                const editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
                                const fromEditorPos = editor?.offsetToPos(from);
                                const toEditorPos = editor?.offsetToPos(to);

                                if (!fromEditorPos || !toEditorPos) {
                                    console.warn('[Autolink] No editor positions');
                                    return;
                                }

                                editor?.replaceRange(replacement, fromEditorPos, toEditorPos);
                            });
                    });
                }

                // Remove the listener to prevent multiple triggers
                document.removeEventListener('contextmenu', contextMenuHandler);
            };

            if (!metaInfo.excludeFile && (metaInfo.includeAllFiles || metaInfo.includeFile || metaInfo.isInIncludedDir)) {
                // Item to exclude a virtual link from the linker
                // This action adds the settings.tagToExcludeFile to the file
                menu.addItem((item) => {
                    item.setTitle('[Virtual Linker] Exclude this file')
                        .setIcon('trash')
                        .onClick(async () => {
                            // Get the shown text
                            const target = file;

                            // Get the file
                            const targetFile = app.vault.getFileByPath(target.path);

                            if (!targetFile) {
                                console.error('No target file');
                                return;
                            }

                            const tagWasUpdated = await this.updateFileTags(
                                targetFile,
                                settings.tagToExcludeFile,
                                settings.tagToIncludeFile
                            );

                            if (tagWasUpdated) {
                                this.scheduleCacheRefresh();
                            }
                        });
                });
            } else if (!metaInfo.includeFile && (!metaInfo.includeAllFiles || metaInfo.excludeFile || metaInfo.isInExcludedDir)) {
                //Item to include a virtual link from the linker
                // This action adds the settings.tagToIncludeFile to the file
                menu.addItem((item) => {
                    item.setTitle('[Virtual Linker] Include this file')
                        .setIcon('plus')
                        .onClick(async () => {
                            // Get the shown text
                            const target = file;

                            // Get the file
                            const targetFile = app.vault.getFileByPath(target.path);

                            if (!targetFile) {
                                console.error('No target file');
                                return;
                            }

                            const tagWasUpdated = await this.updateFileTags(
                                targetFile,
                                settings.tagToIncludeFile,
                                settings.tagToExcludeFile
                            );

                            if (tagWasUpdated) {
                                this.scheduleCacheRefresh();
                            }
                        });
                });
            }

            // Capture the MouseEvent when the context menu is triggered
            document.addEventListener('contextmenu', contextMenuHandler, { once: true });
        } else {
            // Check if the directory is in the linker directories
            const dirPath = file.path + '/';
            const isInIncludedDir = fetcher.includeDirPattern.test(dirPath);
            const isInExcludedDir = fetcher.excludeDirPattern.test(dirPath);

            // If the directory is in the linker directories, add the option to exclude it
            if ((fetcher.includeAllFiles && !isInExcludedDir) || isInIncludedDir) {
                menu.addItem((item) => {
                    item.setTitle('[Virtual Linker] Exclude this directory')
                        .setIcon('trash')
                        .onClick(async () => {
                            // Get the shown text
                            const target = file;

                            // Get the file
                            const targetFolder = app.vault.getAbstractFileByPath(target.path) as TFolder;

                            if (!targetFolder) {
                                console.error('No target folder');
                                return;
                            }

                            const folderPath = normalizeDirectorySetting(targetFolder.path);
                            const newExcludedDirs = Array.from(new Set([
                                ...settings.excludedDirectories.filter((dir) => !matchesFolderSetting(dir, targetFolder)),
                                folderPath,
                            ]));
                            const newIncludedDirs = settings.linkerDirectories.filter((dir) => !matchesFolderSetting(dir, targetFolder));
                            await this.updateSettings({ linkerDirectories: newIncludedDirs, excludedDirectories: newExcludedDirs });
                        });
                });
            } else if ((!fetcher.includeAllFiles && !isInIncludedDir) || isInExcludedDir) {
                // If the directory is in the excluded directories, add the option to include it
                menu.addItem((item) => {
                    item.setTitle('[Virtual Linker] Include this directory')
                        .setIcon('plus')
                        .onClick(async () => {
                            // Get the shown text
                            const target = file;

                            // Get the file
                            const targetFolder = app.vault.getAbstractFileByPath(target.path) as TFolder;

                            if (!targetFolder) {
                                console.error('No target folder');
                                return;
                            }

                            const folderPath = normalizeDirectorySetting(targetFolder.path);
                            const newExcludedDirs = settings.excludedDirectories.filter((dir) => !matchesFolderSetting(dir, targetFolder));
                            const newIncludedDirs = Array.from(new Set([
                                ...settings.linkerDirectories.filter((dir) => !matchesFolderSetting(dir, targetFolder)),
                                folderPath,
                            ]));
                            await this.updateSettings({ linkerDirectories: newIncludedDirs, excludedDirectories: newExcludedDirs });
                        });
                });
            }
        }
    }

    /**
     * Ensure the Autolink Highlights panel is open in the right sidebar and
     * visible.  Creates a new leaf only when none exists yet.
     */
    private async revealHighlightSidebar(): Promise<void> {
        const existing = this.app.workspace.getLeavesOfType(HIGHLIGHT_VIEW_TYPE);
        if (existing.length > 0) {
            this.app.workspace.revealLeaf(existing[0]);
            return;
        }
        // getRightLeaf(false) reuses an existing right-sidebar leaf without
        // splitting; it creates one if the sidebar is completely empty.
        const leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({ type: HIGHLIGHT_VIEW_TYPE, active: true });
            this.app.workspace.revealLeaf(leaf);
        }
    }

    /**
     * Two-phase, mode-agnostic scroll toward the first highlighted occurrence.
     *
     * Phase A – DOM search (both modes)
     *   Reading mode  : <mark class="autolink-highlight"> injected by
     *                   applyHighlightToDOM().  Scroll via DOM scrollIntoView.
     *   Live preview  : <span class="autolink-highlight"> rendered by CM6.
     *                   Scroll via DOM scrollIntoView.
     *
     * Phase B – editor kick (live preview only, runs once when Phase A fails)
     *   The first match may be below the initial CM6 viewport, so the span
     *   doesn’t exist in the DOM yet.  We call editor.scrollIntoView() to
     *   move the editor to that position, which causes CM6 to render it.
     *   The very next poll attempt (Phase A) then finds the span.
     *
     * We use iterateAllLeaves instead of getActiveViewOfType so we find the
     * right view even when Obsidian has briefly shifted focus to a toolbar or
     * a different pane during the opening animation.
     */
    private attemptScroll(
        filePath: string,
        searchText: string,
        attempt: number,
        editorKickDone = false
    ): void {
        const INTERVAL_MS  = 150;
        const MAX_ATTEMPTS = 14; // ~2 s total

        if (attempt >= MAX_ATTEMPTS) return;

        setTimeout(() => {
            // Find the view that holds this file regardless of focus state.
            let view: MarkdownView | null = null;
            this.app.workspace.iterateAllLeaves(leaf => {
                if (!view &&
                    leaf.view instanceof MarkdownView &&
                    leaf.view.file?.path === filePath) {
                    view = leaf.view;
                }
            });
            if (!view) return; // note was closed

            // ── Phase A: DOM search ────────────────────────────────────────
            // Reading mode injected <mark>
            const domMark = (view as MarkdownView).contentEl
                .querySelector('mark.autolink-highlight');
            if (domMark instanceof HTMLElement) {
                domMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }

            // Live-preview CM6 rendered <span class="autolink-highlight">
            const cmMark = (view as MarkdownView).contentEl
                .querySelector('.cm-content .autolink-highlight');
            if (cmMark instanceof HTMLElement) {
                cmMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }

            // ── Phase B: editor kick (live preview, first miss only) ────────
            // Scroll the CM6 editor to the text position so it renders that
            // part of the document.  The next poll will find the span in the DOM.
            // We skip frontmatter so we don't kick to position 0 when the search
            // text appears in aliases/tags but not yet in the visible body.
            if (!editorKickDone) {
                const editor = (view as MarkdownView).editor;
                if (editor) {
                    const raw  = editor.getValue();
                    const file = (view as MarkdownView).file;
                    const fmEnd = file
                        ? (this.app.metadataCache.getFileCache(file)?.frontmatterPosition?.end.offset ?? 0)
                        : 0;
                    const searchFrom = fmEnd > 0 ? fmEnd : 0;
                    const idx = raw.toLowerCase().indexOf(searchText.toLowerCase(), searchFrom);
                    if (idx >= 0) {
                        const from = editor.offsetToPos(idx);
                        const to   = editor.offsetToPos(idx + searchText.length);
                        editor.scrollIntoView({ from, to }, true);
                    }
                }
            }

            // Content / decorations not ready yet — retry.
            this.attemptScroll(filePath, searchText, attempt + 1, true);
        }, attempt === 0 ? 200 : INTERVAL_MS);
    }

    onunload() {
        if (this.cacheRefreshTimer !== null) {
            clearTimeout(this.cacheRefreshTimer);
            this.cacheRefreshTimer = null;
        }
        LinkerCache.resetInstance();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

        // Obsidian does not expose link-format settings via a public API, so we read app.json directly.
        try {
            const fileContent = await this.app.vault.adapter.read(this.app.vault.configDir + '/app.json');
            const appSettings = JSON.parse(fileContent);
            this.settings.defaultUseMarkdownLinks = appSettings.useMarkdownLinks ?? false;
            this.settings.defaultLinkFormat = appSettings.newLinkFormat ?? 'shortest';
        } catch (e) {
            console.warn('[Autolink] Could not read Obsidian app.json settings, using defaults.', e);
        }
    }

    /** Update plugin settings. */
    async updateSettings(settings: Partial<LinkerPluginSettings> = <Partial<LinkerPluginSettings>>{}) {
        Object.assign(this.settings, settings);
        await this.saveData(this.settings);
        this.scheduleCacheRefresh();
    }
}

class LinkerSettingTab extends PluginSettingTab {
    constructor(app: App, public plugin: LinkerPlugin) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        // Toggle to activate or deactivate the linker
        new Setting(containerEl).setName('Activate Virtual Linker').addToggle((toggle) =>
            toggle.setValue(this.plugin.settings.linkerActivated).onChange(async (value) => {
                await this.plugin.updateSettings({ linkerActivated: value });
            })
        );

        // Toggle to show advanced settings
        new Setting(containerEl).setName('Show advanced settings').addToggle((toggle) =>
            toggle.setValue(this.plugin.settings.advancedSettings).onChange(async (value) => {
                await this.plugin.updateSettings({ advancedSettings: value });
                this.display();
            })
        );

        new Setting(containerEl).setName('Matching behavior').setHeading();

        // Toggle to include aliases
        new Setting(containerEl)
            .setName('Include aliases')
            .setDesc('If activated, the virtual linker will also include aliases for the files.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.includeAliases).onChange(async (value) => {
                    await this.plugin.updateSettings({ includeAliases: value });
                })
            );

        // Custom frontmatter fields for linking candidates
        new Setting(containerEl)
            .setName('Custom frontmatter fields for linking')
            .setDesc(
                'Additional frontmatter property names (one per line) whose values are used as ' +
                'link candidates, independent of the aliases toggle. ' +
                'Use this to keep your aliases clean while still creating virtual links from ' +
                'dedicated fields such as `linker-terms` or `keywords`.'
            )
            .addTextArea((text) => {
                text.setPlaceholder('e.g. linker-terms\nkeywords')
                    .setValue((this.plugin.settings.customFrontmatterFields ?? []).join('\n'))
                    .onChange(async (value) => {
                        const fields = value
                            .split('\n')
                            .map(v => v.trim())
                            .filter(v => v.length > 0);
                        await this.plugin.updateSettings({ customFrontmatterFields: fields });
                    });
                text.inputEl.addClass('linker-settings-text-box');
            });

        if (this.plugin.settings.advancedSettings) {
            // Toggle to only link once
            new Setting(containerEl)
                .setName('Only link once')
                .setDesc('If activated, there will not be several identical virtual links in the same note (Wikipedia style).')
                .addToggle((toggle) =>
                    toggle.setValue(this.plugin.settings.onlyLinkOnce).onChange(async (value) => {
                        await this.plugin.updateSettings({ onlyLinkOnce: value });
                    })
                );

            // Toggle to exclude links to real linked files
            new Setting(containerEl)
                .setName('Exclude links to real linked files')
                .setDesc('If activated, there will be no links to files that are already linked in the note by real links.')
                .addToggle((toggle) =>
                    toggle.setValue(this.plugin.settings.excludeLinksToRealLinkedFiles).onChange(async (value) => {
                        await this.plugin.updateSettings({ excludeLinksToRealLinkedFiles: value });
                    })
                );
        }

        // If headers should be matched or not
        new Setting(containerEl)
            .setName('Include headers')
            .setDesc('If activated, headers (so your lines beginning with at least one `#`) are included for virtual links.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.includeHeaders).onChange(async (value) => {
                    await this.plugin.updateSettings({ includeHeaders: value });
                })
            );

        // Toggle setting to match only whole words or any part of the word
        new Setting(containerEl)
            .setName('Match any part of a word')
            .setDesc('If deactivated, only whole words are matched. Otherwise, every part of a word is found.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.matchAnyPartsOfWords).onChange(async (value) => {
                    await this.plugin.updateSettings({ matchAnyPartsOfWords: value });
                    this.display();
                })
            );

        if (!this.plugin.settings.matchAnyPartsOfWords) {
            // Toggle setting to match only beginning of words
            new Setting(containerEl)
                .setName('Match the beginning of words')
                .setDesc('If activated, the beginnings of words are also linked, even if it is not a whole match.')
                .addToggle((toggle) =>
                    toggle.setValue(this.plugin.settings.matchBeginningOfWords).onChange(async (value) => {
                        await this.plugin.updateSettings({ matchBeginningOfWords: value });
                        this.display();
                    })
                );

            // Toggle setting to match only end of words
            new Setting(containerEl)
                .setName('Match the end of words')
                .setDesc('If activated, the ends of words are also linked, even if it is not a whole match.')
                .addToggle((toggle) =>
                    toggle.setValue(this.plugin.settings.matchEndOfWords).onChange(async (value) => {
                        await this.plugin.updateSettings({ matchEndOfWords: value });
                        this.display();
                    })
                );
        }

        // Toggle setting to suppress suffix for sub words
        if (this.plugin.settings.matchAnyPartsOfWords || this.plugin.settings.matchBeginningOfWords) {
            new Setting(containerEl)
                .setName('Suppress suffix for sub words')
                .setDesc('If activated, the suffix is not added to links for subwords, but only for complete matches.')
                .addToggle((toggle) =>
                    toggle.setValue(this.plugin.settings.suppressSuffixForSubWords).onChange(async (value) => {
                        await this.plugin.updateSettings({ suppressSuffixForSubWords: value });
                    })
                );
        }

        if (this.plugin.settings.advancedSettings) {
            // Toggle setting to exclude links in the current line start for fixing IME
            new Setting(containerEl)
                .setName('Fix IME problem')
                .setDesc(
                    'If activated, there will be no links in the current line start which is followed immediately by the Input Method Editor (IME). This is the recommended setting if you are using IME (input method editor) for typing, e.g. for chinese characters, because instant linking might interfere with IME.'
                )
                .addToggle((toggle) =>
                    toggle.setValue(this.plugin.settings.fixIMEProblem).onChange(async (value) => {
                        await this.plugin.updateSettings({ fixIMEProblem: value });
                    })
                );
        }

        if (this.plugin.settings.advancedSettings) {
            // Toggle setting to exclude links in the current line
            new Setting(containerEl)
                .setName('Avoid linking in current line')
                .setDesc('If activated, there will be no links in the current line.')
                .addToggle((toggle) =>
                    toggle.setValue(this.plugin.settings.excludeLinksInCurrentLine).onChange(async (value) => {
                        await this.plugin.updateSettings({ excludeLinksInCurrentLine: value });
                    })
                );

            // Input for setting the word boundary regex
            // new Setting(containerEl)
            // 	.setName('Word boundary regex')
            // 	.setDesc('The regex for the word boundary. This regex is used to find the beginning and end of a word. It is used to find the boundaries of the words to match. Defaults to /[\t- !-/:-@\[-`{-~\p{Emoji_Presentation}\p{Extended_Pictographic}]/u to catch most word boundaries.')
            // 	.addText((text) =>
            // 		text
            // 			.setValue(this.plugin.settings.wordBoundaryRegex)
            // 			.onChange(async (value) => {
            // 				try {
            // 					await this.plugin.updateSettings({ wordBoundaryRegex: value });
            // 				} catch (e) {
            // 					console.error('Invalid regex', e);
            // 				}
            // 			})
            // 	);
        }

        new Setting(containerEl).setName('Case sensitivity').setHeading();

        // Toggle setting for case sensitivity
        new Setting(containerEl)
            .setName('Case sensitive')
            .setDesc('If activated, the matching is case sensitive.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.matchCaseSensitive).onChange(async (value) => {
                    await this.plugin.updateSettings({ matchCaseSensitive: value });
                    this.display();
                })
            );

        if (this.plugin.settings.advancedSettings) {
            // Number input setting for capital letter proportion for automatic match case
            new Setting(containerEl)
                .setName('Capital letter percentage for automatic match case')
                .setDesc(
                    'The percentage (0 - 100) of capital letters in a file name or alias to be automatically considered as case sensitive.'
                )
                .addText((text) =>
                    text
                        .setValue((this.plugin.settings.capitalLetterProportionForAutomaticMatchCase * 100).toFixed(1))
                        .onChange(async (value) => {
                            let newValue = parseFloat(value);
                            if (isNaN(newValue)) {
                                newValue = 75;
                            } else if (newValue < 0) {
                                newValue = 0;
                            } else if (newValue > 100) {
                                newValue = 100;
                            }
                            newValue /= 100;

                            await this.plugin.updateSettings({ capitalLetterProportionForAutomaticMatchCase: newValue });
                        })
                );

            if (this.plugin.settings.matchCaseSensitive) {
                // Text setting for tag to ignore case
                new Setting(containerEl)
                    .setName('Tag to ignore case')
                    .setDesc('By adding this tag to a file, the linker will ignore the case for the file.')
                    .addText((text) =>
                        text.setValue(this.plugin.settings.tagToIgnoreCase).onChange(async (value) => {
                            await this.plugin.updateSettings({ tagToIgnoreCase: value });
                        })
                    );
            } else {
                // Text setting for tag to match case
                new Setting(containerEl)
                    .setName('Tag to match case')
                    .setDesc('By adding this tag to a file, the linker will match the case for the file.')
                    .addText((text) =>
                        text.setValue(this.plugin.settings.tagToMatchCase).onChange(async (value) => {
                            await this.plugin.updateSettings({ tagToMatchCase: value });
                        })
                    );
            }

            // Text setting for property name to ignore case
            new Setting(containerEl)
                .setName('Property name to ignore case')
                .setDesc(
                    'By adding this property to a note, containing a list of names, the linker will ignore the case for the specified names / aliases. This way you can decide, which alias should be insensitive.'
                )
                .addText((text) =>
                    text.setValue(this.plugin.settings.propertyNameToIgnoreCase).onChange(async (value) => {
                        await this.plugin.updateSettings({ propertyNameToIgnoreCase: value });
                    })
                );

            // Text setting for property name to match case
            new Setting(containerEl)
                .setName('Property name to match case')
                .setDesc(
                    'By adding this property to a note, containing a list of names, the linker will match the case for the specified names / aliases. This way you can decide, which alias should be case sensitive.'
                )
                .addText((text) =>
                    text.setValue(this.plugin.settings.propertyNameToMatchCase).onChange(async (value) => {
                        await this.plugin.updateSettings({ propertyNameToMatchCase: value });
                    })
                );
        }

        new Setting(containerEl).setName('Matched files').setHeading();

        new Setting(containerEl)
            .setName('Include all files')
            .setDesc('Include all files for the virtual linker.')
            .addToggle((toggle) =>
                toggle
                    // .setValue(true)
                    .setValue(this.plugin.settings.includeAllFiles)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings({ includeAllFiles: value });
                        this.display();
                    })
            );

        if (!this.plugin.settings.includeAllFiles) {
            new Setting(containerEl)
                .setName('Glossary linker directories')
                .setDesc('Directories to include for the virtual linker (one folder path or name per line).')
                .addTextArea((text) => {
                    let setValue = '';
                    try {
                        setValue = this.plugin.settings.linkerDirectories.join('\n');
                    } catch (e) {
                        console.warn(e);
                    }

                    text.setPlaceholder('List of directory paths or names (one per line)')
                        .setValue(setValue)
                        .onChange(async (value) => {
                            this.plugin.settings.linkerDirectories = value
                                .split('\n')
                                .map((x) => x.trim())
                                .filter((x) => x.length > 0);
                            await this.plugin.updateSettings();
                        });

                    // Set default size
                    text.inputEl.addClass('linker-settings-text-box');
                });
        } else {
            if (this.plugin.settings.advancedSettings) {
                new Setting(containerEl)
                    .setName('Excluded directories')
                    .setDesc(
                        'Directories from which files are to be excluded for the virtual linker (one folder path or name per line). Files in these directories will not create any virtual links in other files.'
                    )
                    .addTextArea((text) => {
                        let setValue = '';
                        try {
                            setValue = this.plugin.settings.excludedDirectories.join('\n');
                        } catch (e) {
                            console.warn(e);
                        }

                        text.setPlaceholder('List of directory paths or names (one per line)')
                            .setValue(setValue)
                            .onChange(async (value) => {
                                this.plugin.settings.excludedDirectories = value
                                    .split('\n')
                                    .map((x) => x.trim())
                                    .filter((x) => x.length > 0);
                                await this.plugin.updateSettings();
                            });

                        // Set default size
                        text.inputEl.addClass('linker-settings-text-box');
                    });
            }
        }

        if (this.plugin.settings.advancedSettings) {
            // Text setting for tag to include file
            new Setting(containerEl)
                .setName('Tag to include file')
                .setDesc('Tag to explicitly include the file for the linker.')
                .addText((text) =>
                    text.setValue(this.plugin.settings.tagToIncludeFile).onChange(async (value) => {
                        await this.plugin.updateSettings({ tagToIncludeFile: value });
                    })
                );

            // Text setting for tag to ignore file
            new Setting(containerEl)
                .setName('Tag to ignore file')
                .setDesc('Tag to ignore the file for the linker.')
                .addText((text) =>
                    text.setValue(this.plugin.settings.tagToExcludeFile).onChange(async (value) => {
                        await this.plugin.updateSettings({ tagToExcludeFile: value });
                    })
                );

            // Toggle setting to exclude links to the active file
            new Setting(containerEl)
                .setName('Exclude self-links to the current note')
                .setDesc('If toggled, links to the note itself are excluded from the linker. (This might not work in preview windows.)')
                .addToggle((toggle) =>
                    toggle.setValue(this.plugin.settings.excludeLinksToOwnNote).onChange(async (value) => {
                        await this.plugin.updateSettings({ excludeLinksToOwnNote: value });
                    })
                );

            // Setting to exclude directories from the linker to be executed
            new Setting(containerEl)
                .setName('Excluded directories for generating virtual links')
                .setDesc('Directories in which the plugin will not create virtual links (one folder path or name per line).')
                .addTextArea((text) => {
                    let setValue = '';
                    try {
                        setValue = this.plugin.settings.excludedDirectoriesForLinking.join('\n');
                    } catch (e) {
                        console.warn(e);
                    }

                    text.setPlaceholder('List of directory paths or names (one per line)')
                        .setValue(setValue)
                        .onChange(async (value) => {
                            this.plugin.settings.excludedDirectoriesForLinking = value
                                .split('\n')
                                .map((x) => x.trim())
                                .filter((x) => x.length > 0);
                            await this.plugin.updateSettings();
                        });

                    // Set default size
                    text.inputEl.addClass('linker-settings-text-box');
                });
        }

        new Setting(containerEl).setName('Link style').setHeading();

        new Setting(containerEl)
            .setName('Always show multiple references')
            .setDesc('If toggled, if there are multiple matching notes, all references are shown behind the match. If not toggled, the references are only shown if hovering over the match.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.alwaysShowMultipleReferences).onChange(async (value) => {
                    await this.plugin.updateSettings({ alwaysShowMultipleReferences: value });
                })
            );

        new Setting(containerEl)
            .setName('Virtual link suffix')
            .setDesc('The suffix to add to auto generated virtual links.')
            .addText((text) =>
                text.setValue(this.plugin.settings.virtualLinkSuffix).onChange(async (value) => {
                    await this.plugin.updateSettings({ virtualLinkSuffix: value });
                })
            );
        new Setting(containerEl)
            .setName('Virtual link suffix for aliases')
            .setDesc('The suffix to add to auto generated virtual links for aliases.')
            .addText((text) =>
                text.setValue(this.plugin.settings.virtualLinkAliasSuffix).onChange(async (value) => {
                    await this.plugin.updateSettings({ virtualLinkAliasSuffix: value });
                })
            );

        // Toggle setting to apply default link styling
        new Setting(containerEl)
            .setName('Apply default link styling')
            .setDesc(
                'If toggled, the default link styling will be applied to virtual links. Furthermore, you can style the links yourself with a CSS-snippet affecting the class `virtual-link`. (Find the CSS snippet directory at Appearance -> CSS Snippets -> Open snippets folder)'
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.applyDefaultLinkStyling).onChange(async (value) => {
                    await this.plugin.updateSettings({ applyDefaultLinkStyling: value });
                })
            );

        // Toggle setting to use default link style for conversion
        new Setting(containerEl)
            .setName('Use default link style for conversion')
            .setDesc('If toggled, the default link style will be used for the conversion of virtual links to real links.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.useDefaultLinkStyleForConversion).onChange(async (value) => {
                    await this.plugin.updateSettings({ useDefaultLinkStyleForConversion: value });
                    this.display();
                })
            );

        if (!this.plugin.settings.useDefaultLinkStyleForConversion) {
            // Toggle setting to use markdown links
            new Setting(containerEl)
                .setName('Use [[Wiki-links]]')
                .setDesc('If toggled, the virtual links will be created as wiki-links instead of markdown links.')
                .addToggle((toggle) =>
                    toggle.setValue(!this.plugin.settings.useMarkdownLinks).onChange(async (value) => {
                        await this.plugin.updateSettings({ useMarkdownLinks: !value });
                    })
                );

            // Dropdown setting for link format
            new Setting(containerEl)
                .setName('Link format')
                .setDesc('The format of the generated links.')
                .addDropdown((dropdown) =>
                    dropdown
                        .addOption('shortest', 'Shortest')
                        .addOption('relative', 'Relative')
                        .addOption('absolute', 'Absolute')
                        .setValue(this.plugin.settings.linkFormat)
                        .onChange(async (value) => {
                            await this.plugin.updateSettings({ linkFormat: value as 'shortest' | 'relative' | 'absolute' });
                        })
                );
        }
    }
}

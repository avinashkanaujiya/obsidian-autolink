import { LinkerPluginSettings } from 'main';
import { App, getAllTags, TAbstractFile, TFile } from 'obsidian';

export function normalizeDirectorySetting(directorySetting: string): string {
    return directorySetting.trim().replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
}

function escapeRegexLiteral(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildDirectoryEntryPattern(directorySetting: string): string {
    const normalized = normalizeDirectorySetting(directorySetting);
    if (normalized.length === 0) {
        return '';
    }

    const escaped = escapeRegexLiteral(normalized);
    return normalized.includes('/')
        ? `^${escaped}(?:/|$)`
        : `(?:^|/)${escaped}(?:/|$)`;
}

export function buildDirectoryPattern(directorySettings: string[]): RegExp {
    const patterns = directorySettings
        .map(buildDirectoryEntryPattern)
        .filter((pattern) => pattern.length > 0);

    return patterns.length > 0 ? new RegExp(patterns.join('|')) : /(?!)/;
}

export function matchesDirectorySetting(path: string, directorySettings: string[]): boolean {
    if (path.trim().length === 0) {
        return false;
    }
    return buildDirectoryPattern(directorySettings).test(normalizeDirectorySetting(path));
}

export class LinkerFileMetaInfo {
    file: TFile;
    tags: string[];
    includeFile: boolean;
    excludeFile: boolean;

    isInIncludedDir: boolean;
    isInExcludedDir: boolean;

    includeAllFiles: boolean;

    constructor(public fetcher: LinkerMetaInfoFetcher, file: TFile | TAbstractFile) {
        this.fetcher = fetcher;
        const resolvedFile = file instanceof TFile ? file : this.fetcher.app.vault.getFileByPath(file.path);
        if (!resolvedFile) {
            console.warn(`[Autolink] Could not resolve file at path: ${file.path}`);
        }
        this.file = resolvedFile as TFile;

        const settings = this.fetcher.settings;

        const fileCache = this.fetcher.app.metadataCache.getFileCache(this.file);
        this.tags = (fileCache ? getAllTags(fileCache) ?? [] : [])
            .filter(tag => tag.trim().length > 0)
            .map(tag => tag.startsWith('#') ? tag.slice(1) : tag);

        this.includeFile = this.tags.includes(settings.tagToIncludeFile);
        this.excludeFile = this.tags.includes(settings.tagToExcludeFile);

        this.includeAllFiles = fetcher.includeAllFiles;
        this.isInIncludedDir = fetcher.includeDirPattern.test(this.file.path);
        this.isInExcludedDir = fetcher.excludeDirPattern.test(this.file.path);
    }
}

export class LinkerMetaInfoFetcher {
    includeDirPattern: RegExp;
    excludeDirPattern: RegExp;
    includeAllFiles: boolean;

    constructor(public app: App, public settings: LinkerPluginSettings) {
        this.refreshSettings();
    }

    refreshSettings(settings?: LinkerPluginSettings) {
        this.settings = settings ?? this.settings;
        this.includeAllFiles = this.settings.includeAllFiles;
        this.includeDirPattern = buildDirectoryPattern(this.settings.linkerDirectories);
        this.excludeDirPattern = buildDirectoryPattern(this.settings.excludedDirectories);
    }

    getMetaInfo(file: TFile | TAbstractFile) {
        return new LinkerFileMetaInfo(this, file);
    }
}

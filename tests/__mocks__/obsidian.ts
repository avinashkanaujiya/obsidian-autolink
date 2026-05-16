/** Minimal Obsidian API surface used by this plugin. */

export class TFile {
    path: string;
    basename: string;
    extension: string;
    stat: { mtime: number; ctime: number; size: number };
    parent: TFolder | null;

    constructor(path: string) {
        this.path = path;
        const base = path.split('/').pop() ?? path;
        this.basename = base.replace(/\.md$/, '');
        this.extension = 'md';
        this.stat = { mtime: 1000, ctime: 1000, size: 0 };
        this.parent = null;
    }
}

export class TFolder {
    path: string;
    name: string;
    constructor(path: string) {
        this.path = path;
        this.name = path.split('/').pop() ?? path;
    }
}

export class TAbstractFile {
    path: string = '';
}

export function getAllTags(cache: any): string[] | null {
    if (!cache) return null;
    const tags: string[] = [];
    if (Array.isArray(cache.tags)) tags.push(...cache.tags.map((t: any) => t.tag ?? t));
    if (cache.frontmatter?.tags) {
        const ft = cache.frontmatter.tags;
        if (Array.isArray(ft)) tags.push(...ft);
        else if (typeof ft === 'string') tags.push(ft);
    }
    return tags.length > 0 ? tags : null;
}

export function parseFrontMatterAliases(frontmatter: any): string[] | null {
    if (!frontmatter?.aliases) return null;
    const a = frontmatter.aliases;
    return Array.isArray(a) ? a : [a];
}

export class App {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class Menu {}
export class WorkspaceLeaf {}
export class Keymap {
    static isModEvent(evt?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }): boolean {
        return Boolean(evt?.ctrlKey || evt?.metaKey || evt?.shiftKey);
    }
}
export class ItemView {
    contentEl: HTMLElement;
    constructor(_leaf?: WorkspaceLeaf) {
        this.contentEl = globalThis.document?.createElement?.('div') ?? ({} as HTMLElement);
    }
}
export class MarkdownView {}
export class MarkdownRenderChild {
    constructor(public containerEl: HTMLElement) {}
    load() {}
}
export function getLinkpath(linkpath: string): string { return linkpath; }

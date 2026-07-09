import { App, Notice, TFile } from 'obsidian';
import { LinkerPluginSettings } from 'main';

/**
 * Remove a term from the given frontmatter object.
 * Returns true if any field was modified.
 */
function removeTermFromFields(
    fm: Record<string, unknown>,
    term: string,
    customFields: string[],
): boolean {
    const fieldsToClean = ['aliases', ...customFields];
    const termLower = term.toLowerCase();
    let modified = false;

    for (const field of fieldsToClean) {
        const value = fm[field];
        if (!Array.isArray(value)) continue;

        const filtered = value.filter(
            (item) => typeof item !== 'string' || item.toLowerCase() !== termLower,
        );

        if (filtered.length === value.length) continue;

        modified = true;
        if (filtered.length === 0) {
            delete fm[field];
        } else {
            fm[field] = filtered;
        }
    }

    return modified;
}

/**
 * Remove a term from a note's frontmatter (aliases + custom frontmatter fields)
 * and refresh the linker cache for that file.
 *
 * Returns true if the frontmatter was modified.
 */
export async function removeTermFromFrontmatter(
    app: App,
    settings: LinkerPluginSettings,
    updateManager: { update: () => void },
    filePath: string,
    term: string,
): Promise<boolean> {
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
        new Notice(`File not found: ${filePath}`);
        return false;
    }

    const customFields = settings.customFrontmatterFields ?? [];

    let modified = false;
    try {
        await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
            modified = removeTermFromFields(fm, term, customFields);
        });
    } catch (e) {
        console.error('[Virtual Autolink] Failed to remove term from frontmatter', e);
        new Notice(`Failed to update frontmatter for ${file.basename}`);
        return false;
    }

    if (modified) {
        updateManager.update();
        new Notice(`Removed "${term}" from ${file.basename}`);
    }

    return modified;
}

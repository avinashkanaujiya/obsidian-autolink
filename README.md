[![GitHub Sponsors](https://img.shields.io/badge/sponsor-GitHub%20Sponsors-pink.svg)](https://github.com/sponsors/avinashkanaujiya)

> [!NOTE]
> This project was originally forked from [Obsidian Virtual Linker](https://github.com/vschroeter/obsidian-virtual-linker) by [Valentin Schröter](https://github.com/vschroeter/), now maintained independently as **Autolink**.

# Autolink

This plugin automatically generates virtual links for text within your notes that match with the titles or aliases of other notes in your vault.

Features:
- create a glossary like functionality
- works in **edit mode** and **read mode**
- created links are **always up to date** 
- **no manual linking** necessary 
- works with **aliases** of notes
- links do not appear in graph view & reference counting
- updates the links automatically while you expand your vault or type new text
- convert the virtual links to real links in the context menu

Usage demo (literally just typing text ;-):
![Demo](media/LinkerDemo.gif)

## Usage

By default, the plugin will automatically link all notes of your vault.
All occurrences of a note title or alias will be linked in your current note text.
If you only want to include notes of a specific folder, you can define this folder in the settings.

> [!Note]
> The auto generated links are post-processed, so they neither change your note text to hard-coded links enclosed in brackets not 
> appear in the graph view or reference counting.

## Installing the plugin

### Via BRAT (Recommended)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin in Obsidian
2. In BRAT settings, add `avinashkanaujiya/obsidian-autolink` as a beta plugin
3. Enable "Autolink" in Community Plugins settings

### Manual install

- Download `main.js` & `manifest.json` from [Releases](https://github.com/avinashkanaujiya/obsidian-autolink/releases)
- Copy them to `VaultFolder/.obsidian/plugins/autolink/`
- Enable the plugin in settings

## Settings

## Matched files

You can toggle the matching of files between:
- "Match all files": All files in your vault are matched.
- "Match only files in a specific folder": Only files in a specific folder are matched. You can specify the folder in the settings. This is useful if you want to only create virtual links to notes in a dedicated glossary directory.

Furthermore, you can explicitly include or exclude specific files from being matched, by adding a tag to the file. You can change the tag in the settings, by default it is:
- `linker-include` to explicitly include a file
- `linker-exclude` to explicitly exclude a file

You can also exclude all files in a specific folder by adding the folder to the exclude list in the settings.

> [!Note]
> To include / exclude a file or folder, you can use the context menu on virtual links or in the file explorer.

### Case sensitivity
You can toggle the case sensitivity of the matching. By default, the matching is case insensitive.

Often there are words with mainly capitalized letters, that should be matched case sensitive. By default, words with 75% or more capitalized letters are matched case sensitive. You can change this threshold in the settings.

You can also explicitly change the case sensitivity of a specific file by adding a tag to the file. You can change the tag in the settings, by default it is:
- `linker-match-case` to make the matching case sensitive
- `linker-ignore-case` to make the matching case insensitive

If you want to define the case sensitivity for specific aliases, you can define the frontmatter property lists in a note:
- `linker-match-case` with a list of names that should be matched only case sensitive
- `linker-ignore-case` with a list of names that should be matched case insensitive 
These property names can be changed in the settings.

### Matching mode

#### Suppress multiple matching and matching to real links
By default, the plugin will suppress several identical virtual link in the same note.
Repeated identical matches on the same line are also collapsed to the first occurrence to reduce visual clutter.
Furthermore, you can toggle to suppress the creation of virtual links to files, that are linked by real links in the current note. 

#### Part matching
You can toggle the matching mode between:
- "Matching only whole words": Only whole words are matched. E.g. "book" will not match "Notebook".
- "Match also beginning of words": The beginning of a word is matched. E.g. "book" will not match "Notebook", but "Note" will match "Notebook".
- "Matching any part of a word": Any part of a word is matched. E.g. "book" will match "Notebook".

You furthermore have the option to suppress the link suffix for these matches to avoid cluttering your text.

#### Links to the note itself
By default, links to a note itself are suppressed.
This link suppression might be a bit buggy and not work in all cases, e.g. in preview windows.
If you like self-links to the note itself, you can toggle this behavior in the settings.

#### Link suppression in current line 
By default, links are created directly as you type.
You can disable links for the current line you are typing.

> [!Note]
> Deactivating the link creation for the current line is recommended when using the plugin with IME (input method editor) for languages like Chinese or Japanese, as the plugin might otherwise interfere with the IME.


### Styling of the links

Any created virtual link will be appended with this suffix. This is useful to distinguish between real and virtual links.
By default, the suffix is "🔗".
When a virtual link points to multiple candidate notes, the numbered chooser now includes an `oa` entry first, which opens all matched notes in sequence.

By default (and if the default styling is toggled on in the settings), the links inherit the surrounding text styling and add a very faint dashed underline so they blend into surrounding text.
When you hover a virtual link, the surrounding text styling is preserved and the underline becomes solid. Display-text highlights still use the current theme accent.
You can turn off this default styling in the settings.

To apply custom styling to the links, you can add a CSS-snippet at `VaultFolder/.obsidian/snippets/virtualLinks.css` file.

```css
/* Properties of the virtual link when not hovered */
.virtual-link.glossary-entry {
    color: inherit;
}

.virtual-link.glossary-entry a {
    color: inherit;
    text-decoration-thickness: 1px;
    text-decoration-style: dashed;
    text-decoration-color: color-mix(in srgb, currentColor 18%, transparent);
    text-underline-position: under;
}

/* Properties of the virtual link when hovered */
.virtual-link.glossary-entry:hover {
    color: inherit;
}

.virtual-link.glossary-entry a:hover {
    color: inherit;
    text-decoration-style: solid;
    text-decoration-color: currentColor;
}
```

> [!Note]
> If you want to apply custom styling, don't forget to turn off the "Apply default link styling" in the settings.

## Commands

The plugin provides the following commands that you can use:

- **Convert All Virtual Links in Selection to Real Links**: Converts all virtual links within the selected text to real links.
- **Activate Virtual Linker**: Activates autolink if it is currently deactivated.
- **Deactivate Virtual Linker**: Deactivates autolink if it is currently activated.

You can access these commands from the command palette or assign custom hotkeys to them in the settings.

## Context Menu Options

When right-clicking on a virtual link, the following options are available in the context menu:

- **Convert to real link**: Converts the selected virtual link to a real link.
- **Exclude this file**: Adds the `linker-exclude` tag to the file, preventing it from being matched by autolink.
- **Include this file**: Adds the `linker-include` tag to the file, ensuring it is matched by autolink.

## How to use for development

- Clone [this repo](https://github.com/avinashkanaujiya/obsidian-autolink) into `your-vault/.obsidian/plugins/`.
- `yarn` to install dependencies
- `yarn dev` to start compilation in watch mode.
- `yarn build` to compile your `main.ts` into `main.js`.

It is recommended to use the [Hot Reload Plugin](https://github.com/pjeby/hot-reload) for development.

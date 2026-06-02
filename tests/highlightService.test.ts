import { findFirstMatch, HighlightService, SectionSourceMapper } from '../linker/highlightService';

describe('findFirstMatch', () => {
    it('returns the first case-insensitive match', () => {
        expect(findFirstMatch('Plato plato', 'plato')).toEqual({
            index: 0,
            matchText: 'Plato',
        });
    });

    it('returns null when the text is absent', () => {
        expect(findFirstMatch('Aristotle', 'plato')).toBeNull();
    });
});

describe('SectionSourceMapper', () => {
    it('maps rendered text chunks back to their source order', () => {
        const mapper = new SectionSourceMapper('**Plato** and Plato\nNext Plato', 10);

        const first = mapper.locate('Plato');
        const second = mapper.locate(' and Plato');
        const third = mapper.locate('Next Plato');

        expect(first).toBe(2);
        expect(second).toBe(9);
        expect(third).toBe(20);
        expect(mapper.lineNumberAt(first ?? 0)).toBe(10);
        expect(mapper.lineNumberAt((second ?? 0) + 5)).toBe(10);
        expect(mapper.lineNumberAt((third ?? 0) + 5)).toBe(11);
    });

    it('advances through repeated text without rematching earlier occurrences', () => {
        const mapper = new SectionSourceMapper('Plato and Plato and Plato');

        expect(mapper.locate('Plato')).toBe(0);
        expect(mapper.locate(' and Plato')).toBe(5);
        expect(mapper.locate(' and Plato')).toBe(15);
    });
});

describe('HighlightService pending queue', () => {
    it('tracks pending highlights for multiple target files independently', () => {
        const service = new HighlightService();

        service.setPending('Notes/First.md', 'Plato');
        service.setPending('Notes/Second.md', 'Aristotle');

        expect(service.activateForFile('Notes/First.md')).toBe('Plato');
        expect(service.activateForFile('Notes/Second.md')).toBe('Aristotle');
        expect(service.getActive('Notes/First.md')).toBe('Plato');
        expect(service.getActive('Notes/Second.md')).toBe('Aristotle');
    });
});

describe('HighlightService.getAllActive', () => {
    let dateNowSpy: jest.SpyInstance;

    beforeEach(() => {
        let counter = 1000;
        dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => {
            counter += 50;
            return counter;
        });
    });

    afterEach(() => {
        dateNowSpy.mockRestore();
    });

    it('returns all active highlights sorted by activation time (most recent first)', () => {
        const service = new HighlightService();

        service.setPending('Notes/First.md', 'Plato');
        service.setPending('Notes/Second.md', 'Aristotle');
        service.setPending('Notes/Third.md', 'Socrates');

        service.activateForFile('Notes/First.md');
        service.activateForFile('Notes/Second.md');
        service.activateForFile('Notes/Third.md');

        const all = service.getAllActive();
        expect(all).toHaveLength(3);
        expect(all[0].filePath).toBe('Notes/Third.md');
        expect(all[1].filePath).toBe('Notes/Second.md');
        expect(all[2].filePath).toBe('Notes/First.md');

        expect(all[0].activatedAt).toBeGreaterThan(all[1].activatedAt);
        expect(all[1].activatedAt).toBeGreaterThan(all[2].activatedAt);
    });

    it('returns an empty array when no highlights are active', () => {
        const service = new HighlightService();
        expect(service.getAllActive()).toEqual([]);
    });

    it('excludes stale (closed) highlights after clearStale', () => {
        const service = new HighlightService();
        service.setPending('Notes/First.md', 'Plato');
        service.setPending('Notes/Second.md', 'Aristotle');
        service.activateForFile('Notes/First.md');
        service.activateForFile('Notes/Second.md');

        expect(service.getAllActive()).toHaveLength(2);

        service.clearStale(new Set(['Notes/First.md']));
        const remaining = service.getAllActive();
        expect(remaining).toHaveLength(1);
        expect(remaining[0].filePath).toBe('Notes/First.md');
    });
});

describe('HighlightService.activateForFile', () => {
    it('sets activatedAt timestamp when promoting pending to active', () => {
        const service = new HighlightService();
        service.setPending('Notes/First.md', 'Plato');

        const before = Date.now();
        service.activateForFile('Notes/First.md');
        const after = Date.now();

        const all = service.getAllActive();
        expect(all).toHaveLength(1);
        expect(all[0].activatedAt).toBeGreaterThanOrEqual(before);
        expect(all[0].activatedAt).toBeLessThanOrEqual(after);
    });

    it('does not change activatedAt on re-activation of already active highlight', () => {
        const service = new HighlightService();
        service.setPending('Notes/First.md', 'Plato');
        service.activateForFile('Notes/First.md');

        const firstActivatedAt = service.getAllActive()[0].activatedAt;

        // Re-activating the same file should be a no-op
        service.activateForFile('Notes/First.md');

        expect(service.getAllActive()[0].activatedAt).toBe(firstActivatedAt);
    });
});

describe('HighlightService.removeActive', () => {
    it('removes the active highlight for a specific file/term pair', () => {
        const service = new HighlightService();
        service.setPending('Notes/First.md', 'Plato');
        service.setPending('Notes/Second.md', 'Aristotle');
        service.activateForFile('Notes/First.md');
        service.activateForFile('Notes/Second.md');

        expect(service.getAllActive()).toHaveLength(2);

        service.removeActive('Notes/First.md', 'Plato');

        const remaining = service.getAllActive();
        expect(remaining).toHaveLength(1);
        expect(remaining[0].filePath).toBe('Notes/Second.md');
        expect(remaining[0].searchText).toBe('Aristotle');
    });

    it('does nothing if the term does not match', () => {
        const service = new HighlightService();
        service.setPending('Notes/First.md', 'Plato');
        service.activateForFile('Notes/First.md');

        service.removeActive('Notes/First.md', 'Aristotle');

        expect(service.getAllActive()).toHaveLength(1);
    });

    it('does nothing if the file has no active highlight', () => {
        const service = new HighlightService();
        service.setPending('Notes/First.md', 'Plato');
        service.activateForFile('Notes/First.md');

        service.removeActive('Notes/Second.md', 'Plato');

        expect(service.getAllActive()).toHaveLength(1);
    });
});

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

import { describe, expect, it } from 'vitest';
import { buildBibliography, renderCitations, sectionWarnings, type CitationRef } from './render';

const a = { id: 'a1', title: 'Estudo X', authors: [{ family: 'Silva', given: 'Ana' }], year: 2020, metadata_verified: true };
const id1 = '11111111-1111-1111-1111-111111111111';
const id2 = '22222222-2222-2222-2222-222222222222';
const cits = new Map<string, CitationRef>([[id1, { id: id1, article: a, locator: 'p. 4' }]]);

describe('writing/render', () => {
  it('resolve citações e marca órfãs', () => {
    expect(renderCitations(`Texto [@cite:${id1}] e [@cite:${id2}].`, cits)).toBe('Texto (SILVA, 2020, p. 4) e [CITAÇÃO NÃO ENCONTRADA].');
  });
  it('bibliografia só com artigos citados, sem duplicar', () => {
    expect(buildBibliography([...cits.values(), ...cits.values()])).toEqual(['SILVA, Ana. Estudo X. 2020.']);
  });
  it('alerta sobre rigor', () => {
    const w = sectionWarnings({ content: `x [@cite:${id2}]`, citations: cits, claims: [{ text: 'Afirmação sem prova', status: 'unsupported' }] });
    expect(w.map((x) => x.level)).toEqual(['error', 'warn']);
  });
});

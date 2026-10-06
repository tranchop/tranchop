import { describe, expect, it } from 'vitest';
import { formatAbntInText, formatAbntReference } from './abnt';

const base = { title: 'Efeito do composto X', authors: [{ family: 'Silva', given: 'Ana' }, { family: 'Souza', given: 'Bruno' }], year: 2020, journal: 'Revista Y', volume: '12', issue: '3', pages: '10-20', doi: '10.1/abc' };

describe('ABNT', () => {
  it('referência completa', () => {
    expect(formatAbntReference(base)).toBe('SILVA, Ana; SOUZA, Bruno. Efeito do composto X. Revista Y, v. 12, n. 3, p. 10-20, 2020. DOI: 10.1/abc.');
  });
  it('mais de 3 autores usa et al.', () => {
    const many = { ...base, authors: ['A', 'B', 'C', 'D'].map((f) => ({ family: f, given: 'x' })) };
    expect(formatAbntReference(many)).toContain('A, x et al.');
  });
  it('não inventa dados ausentes', () => {
    const r = formatAbntReference({ title: 'Sem nada', authors: [], year: null });
    expect(r).toBe('Sem nada. [s.d.].');
    expect(r).not.toContain('DOI');
  });
  it('citação no texto', () => {
    expect(formatAbntInText(base, 'p. 12')).toBe('(SILVA; SOUZA, 2020, p. 12)');
    expect(formatAbntInText({ ...base, authors: [{ family: 'Lee' }] })).toBe('(LEE, 2020)');
    expect(formatAbntInText({ ...base, authors: ['A', 'B', 'C', 'D'].map((f) => ({ family: f })) })).toBe('(A et al., 2020)');
  });
});

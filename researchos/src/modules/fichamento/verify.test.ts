import { describe, expect, it } from 'vitest';
import { verifyField, verifyMetadata } from './verify';

const pages = [
  'Efeito do composto X na viabilidade celular\nSilva A, Souza B\nRevista Y 2020',
  'Resultados: o composto X reduziu a viabilidade celular em 40% (p < 0,05) após 24 h.'
];

describe('verifyField', () => {
  it('extraído + citação literal + números ok => source_extracted com passagem', () => {
    const v = verifyField({ field_key: 'results', content: 'reduziu a viabilidade celular em 40%', kind: 'extracted', page: 2, quote: 'reduziu a viabilidade celular em 40% (p < 0,05)' }, pages)!;
    expect(v.origin).toBe('source_extracted');
    expect(v.passage).toEqual({ page: 2, quote: 'reduziu a viabilidade celular em 40% (p < 0,05)' });
    expect(v.warnings).toEqual([]);
  });
  it('encontra a página certa mesmo com página errada informada', () => {
    const v = verifyField({ field_key: 'results', content: 'x', kind: 'extracted', page: 1, quote: 'reduziu a viabilidade celular em 40%' }, pages)!;
    expect(v.passage?.page).toBe(2);
  });
  it('citação inventada => rebaixa para ai_inferred sem passagem', () => {
    const v = verifyField({ field_key: 'results', content: 'aumentou a proliferação', kind: 'extracted', page: 2, quote: 'aumentou fortemente a proliferação celular' }, pages)!;
    expect(v.origin).toBe('ai_inferred');
    expect(v.passage).toBeNull();
    expect(v.warnings.length).toBeGreaterThan(0);
  });
  it('número que não está na citação => rebaixa e avisa', () => {
    const v = verifyField({ field_key: 'results', content: 'redução de 75%', kind: 'extracted', page: 2, quote: 'reduziu a viabilidade celular em 40%' }, pages)!;
    expect(v.origin).toBe('ai_inferred');
    expect(v.warnings.join(' ')).toContain('75');
  });
  it('relevância é sempre sugestão da IA', () => {
    expect(verifyField({ field_key: 'relevance', content: 'Útil para a H1', kind: 'extracted' }, pages)!.origin).toBe('ai_suggested');
  });
  it('descarta chave desconhecida e conteúdo vazio', () => {
    expect(verifyField({ field_key: 'foo', content: 'x', kind: 'inferred' }, pages)).toBeNull();
    expect(verifyField({ field_key: 'objective', content: '  ', kind: 'inferred' }, pages)).toBeNull();
  });
});

describe('verifyMetadata', () => {
  it('mantém apenas o que aparece no PDF', () => {
    const m = verifyMetadata({ title: 'Efeito do composto X na viabilidade celular', year: 2020, journal: 'Revista Y', authors: ['Ana Silva', 'Fulano Inventado'] }, pages);
    expect(m.title).toBeDefined();
    expect(m.year).toBe(2020);
    expect(m.journal).toBe('Revista Y');
    expect(m.authors?.map((a) => a.family)).toEqual(['Silva']);
  });
  it('descarta ano e título inventados', () => {
    const m = verifyMetadata({ title: 'Título completamente diferente do artigo', year: 1999 }, pages);
    expect(m).toEqual({});
  });
});

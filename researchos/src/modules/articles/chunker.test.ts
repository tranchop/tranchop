import { describe, expect, it } from 'vitest';
import { chunkPages } from './chunker';

describe('chunkPages', () => {
  it('mantém a página de origem e índices sequenciais', () => {
    const pages = ['a'.repeat(50) + ' texto da página um. '.repeat(120), 'curta', 'segunda página com conteúdo suficiente para virar trecho.'];
    const chunks = chunkPages(pages, 500, 50);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
    expect(chunks[0].pageNumber).toBe(1);
    expect(chunks.at(-1)!.pageNumber).toBe(3);
    expect(chunks.some((c) => c.pageNumber === 2)).toBe(false); // página quase vazia ignorada
    expect(Math.max(...chunks.map((c) => c.content.length))).toBeLessThanOrEqual(500);
  });
  it('nunca entra em loop com texto sem pontuação', () => {
    expect(chunkPages(['x'.repeat(5000)], 1000, 100).length).toBeGreaterThan(4);
  });
});

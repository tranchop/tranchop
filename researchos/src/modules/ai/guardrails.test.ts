import { describe, expect, it } from 'vitest';
import { extractDois, normalize, numbersIn, parseJsonLoose, quoteInSource, unsupportedNumbers } from './guardrails';

const page = `O tratamento com o composto X reduziu a viabili-\ndade celular em 40% (p < 0,05) após 24 h de exposição.`;

describe('quoteInSource', () => {
  it('aceita citação literal, ignorando acentos, caixa e hifenização', () => {
    expect(quoteInSource('reduziu a viabilidade celular em 40%', page)).toBe(true);
    expect(quoteInSource('REDUZIU A VIABILIDADE CELULAR EM 40%', page)).toBe(true);
  });
  it('rejeita citação inventada ou alterada', () => {
    expect(quoteInSource('reduziu a viabilidade celular em 60%', page)).toBe(false);
    expect(quoteInSource('aumentou a proliferação', page)).toBe(false);
  });
  it('rejeita trechos curtos demais', () => {
    expect(quoteInSource('composto X', page)).toBe(false);
  });
  it('aceita elipses em ordem e rejeita fora de ordem', () => {
    expect(quoteInSource('composto X reduziu ... após 24 h de exposição', page)).toBe(true);
    expect(quoteInSource('após 24 h de exposição ... composto X reduziu', page)).toBe(false);
  });
});

describe('extractDois', () => {
  it('extrai DOI presente no texto sem pontuação final', () => {
    expect(extractDois('Disponível em https://doi.org/10.1016/j.cell.2020.01.001.')).toEqual(['10.1016/j.cell.2020.01.001']);
  });
  it('não inventa DOI quando não há', () => {
    expect(extractDois('Sem identificador algum aqui.')).toEqual([]);
  });
});

describe('numbers', () => {
  it('normaliza vírgula decimal', () => {
    expect(numbersIn('p < 0,05 e 40%')).toEqual(['0.05', '40']);
  });
  it('detecta números sem suporte na fonte', () => {
    expect(unsupportedNumbers('Redução de 40% e 75%', [page])).toEqual(['75']);
    expect(unsupportedNumbers('Redução de 40%', [page])).toEqual([]);
  });
});

describe('parseJsonLoose / normalize', () => {
  it('lê JSON dentro de cerca de código', () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('falha sem JSON', () => {
    expect(() => parseJsonLoose('nada')).toThrow();
  });
  it('normaliza acentos e aspas', () => {
    expect(normalize('Ação “Ótima”')).toBe('acao "otima"');
  });
});

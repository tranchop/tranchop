import { describe, expect, it } from 'vitest';
import { validateAnswer, type ContextBlock } from './service';

const blocks: ContextBlock[] = [
  { ref: 'C1', kind: 'pdf', label: 'Silva (2020), p. 2', text: 'O composto X reduziu a viabilidade em 40%.', projectId: 'p' },
  { ref: 'C2', kind: 'note', label: 'nota', text: 'Hipótese: dose-dependência.', projectId: 'p' }
];

describe('validateAnswer', () => {
  it('aceita resposta citando blocos reais com números suportados', () => {
    const v = validateAnswer({ sufficient: true, answer: 'X reduziu a viabilidade em 40% [C1].', citations: ['C1'] }, blocks);
    expect(v.ok).toBe(true);
  });
  it('rejeita número inventado', () => {
    const v = validateAnswer({ sufficient: true, answer: 'X reduziu a viabilidade em 55% [C1].', citations: ['C1'] }, blocks);
    expect(v.ok).toBe(false);
    expect(v.warnings.join()).toContain('55');
  });
  it('rejeita citação de bloco inexistente', () => {
    expect(validateAnswer({ sufficient: true, answer: 'Algo [C9].', citations: ['C9'] }, blocks).ok).toBe(false);
  });
  it('rejeita resposta sem nenhuma citação', () => {
    expect(validateAnswer({ sufficient: true, answer: 'Resposta solta sem fonte.', citations: [] }, blocks).ok).toBe(false);
  });
  it('respeita sufficient=false', () => {
    expect(validateAnswer({ sufficient: false, answer: '', citations: [] }, blocks).ok).toBe(false);
  });
});

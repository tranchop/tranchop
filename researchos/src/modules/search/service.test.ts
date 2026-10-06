import { describe, expect, it } from 'vitest';
import { rrf } from './service';

describe('rrf', () => {
  it('itens presentes em várias listas sobem no ranking', () => {
    const r = rrf([['a', 'b', 'c'], ['c', 'd'], ['c', 'a']], (x) => x);
    expect(r[0].item).toBe('c');
    expect(r.map((x) => x.item).sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});

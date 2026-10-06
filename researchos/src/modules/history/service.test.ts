import { describe, expect, it } from 'vitest';
import { diffFields } from './service';

describe('diffFields', () => {
  it('lista só o que mudou e ignora updated_at', () => {
    const d = diffFields({ a: 1, b: 'x', updated_at: '1' }, { a: 2, b: 'x', updated_at: '2' });
    expect(d).toEqual([{ field: 'a', before: 1, after: 2 }]);
  });
  it('insert e delete', () => {
    expect(diffFields(null, { a: 1 })).toEqual([{ field: 'a', before: null, after: 1 }]);
  });
});

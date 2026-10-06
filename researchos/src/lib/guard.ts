import { redirect, unstable_rethrow } from 'next/navigation';

/**
 * Executa uma server action; em caso de erro, volta à página com ?error=...
 * (mensagens de exceção são ocultadas pelo Next em produção, então não deixamos vazar para o boundary).
 */
export async function guard(backTo: string, fn: () => Promise<string | void>): Promise<void> {
  let target: string | void;
  try {
    target = await fn();
  } catch (e) {
    unstable_rethrow(e); // deixa passar redirect/notFound do Next
    const msg = e instanceof Error ? e.message : 'Erro inesperado';
    const sep = backTo.includes('?') ? '&' : '?';
    redirect(`${backTo}${sep}error=${encodeURIComponent(msg)}`);
  }
  if (typeof target === 'string') redirect(target);
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

export function optStr(fd: FormData, key: string): string | null {
  return str(fd, key) || null;
}

export function num(fd: FormData, key: string): number | null {
  const v = str(fd, key).replace(',', '.');
  if (!v) return null;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Valor numérico inválido em "${key}".`);
  return n;
}

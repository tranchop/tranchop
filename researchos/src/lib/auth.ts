import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/** Cliente com a sessão do usuário. Toda autorização real é feita por RLS no banco. */
export async function requireUser() {
  const db = await createClient();
  const { data } = await db.auth.getUser();
  if (!data.user) redirect('/login');
  return { db, user: data.user };
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

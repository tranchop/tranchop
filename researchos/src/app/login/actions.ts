'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { guard, str } from '@/lib/guard';

export async function signIn(fd: FormData) {
  await guard('/login', async () => {
    const db = await createClient();
    const { error } = await db.auth.signInWithPassword({ email: str(fd, 'email'), password: str(fd, 'password') });
    if (error) throw new Error('E-mail ou senha inválidos.');
    return '/projects';
  });
}

export async function signUp(fd: FormData) {
  await guard('/login', async () => {
    const db = await createClient();
    const password = str(fd, 'password');
    if (password.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
    const { data, error } = await db.auth.signUp({ email: str(fd, 'email'), password });
    if (error) throw new Error(error.message);
    if (!data.session) throw new Error('Conta criada. Confirme o e-mail enviado para poder entrar.');
    return '/projects';
  });
  redirect('/projects');
}

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureDissertation, exportMarkdown } from '@/modules/writing/service';

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const db = await createClient();
  const { data } = await db.auth.getUser();
  if (!data.user) return new NextResponse('Não autenticado', { status: 401 });
  const docId = await ensureDissertation(db, projectId);
  const md = await exportMarkdown(db, docId);
  return new NextResponse(md, { headers: { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': 'attachment; filename="dissertacao.md"' } });
}

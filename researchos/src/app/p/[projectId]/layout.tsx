import { notFound } from 'next/navigation';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ProjectNav } from '@/components/ProjectNav';
import { requireUser } from '@/lib/auth';
import { getProject } from '@/modules/projects/service';

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { db } = await requireUser();
  const project = await getProject(db, projectId);
  if (!project) notFound();
  return (
    <div className="shell">
      <ProjectNav projectId={projectId} name={project.name} />
      <main className="content">
        <ErrorBanner />
        {children}
      </main>
    </div>
  );
}

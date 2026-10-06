import Link from 'next/link';

const ITEMS: [string, string][] = [
  ['', 'Painel'], ['project', 'Projeto'], ['articles', 'Biblioteca'], ['knowledge', 'Conhecimento'], ['evidence', 'Evidências'],
  ['experiments', 'Experimentos'], ['lab', 'Caderno & reagentes'], ['tasks', 'Tarefas & reuniões'], ['dissertation', 'Dissertação'],
  ['search', 'Busca'], ['assistant', 'Assistente'], ['history', 'Histórico']
];

export function ProjectNav({ projectId, name }: { projectId: string; name: string }) {
  return (
    <nav className="sidebar" aria-label="Navegação do projeto">
      <Link href="/projects" className="back">← Projetos</Link>
      <div className="project-name">{name}</div>
      <ul>
        {ITEMS.map(([path, label]) => (
          <li key={path}><Link href={`/p/${projectId}${path ? `/${path}` : ''}`}>{label}</Link></li>
        ))}
      </ul>
      <form action="/auth/signout" method="post"><button className="btn btn-ghost small" type="submit">Sair</button></form>
    </nav>
  );
}

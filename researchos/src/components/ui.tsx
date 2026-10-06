import Link from 'next/link';
import type { ReactNode } from 'react';
import { ORIGIN_LABEL, REVIEW_LABEL, type Origin, type ReviewStatus } from '@/lib/types';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export function Card({ title, children, id, className = '' }: { title?: ReactNode; children: ReactNode; id?: string; className?: string }) {
  return (
    <section className={`card ${className}`} id={id}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

/** Proveniência: de onde veio a informação e se foi revisada por um humano. */
export function Provenance({ origin, review }: { origin: Origin; review?: ReviewStatus }) {
  return (
    <span className="prov">
      <span className={`badge origin-${origin}`} title="Origem da informação">{ORIGIN_LABEL[origin]}</span>
      {review && review !== 'approved' && <span className={`badge review-${review}`}>{REVIEW_LABEL[review]}</span>}
    </span>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'info' }) {
  return <span className={`badge tone-${tone}`}>{children}</span>;
}

export function Field({ label, name, type = 'text', required, defaultValue, placeholder, rows, children }: {
  label: string; name: string; type?: string; required?: boolean; defaultValue?: string | number | null; placeholder?: string; rows?: number; children?: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children ? (
        children
      ) : rows ? (
        <textarea name={name} rows={rows} required={required} defaultValue={defaultValue ?? ''} placeholder={placeholder} />
      ) : (
        <input name={name} type={type} required={required} defaultValue={defaultValue ?? ''} placeholder={placeholder} />
      )}
    </label>
  );
}

export function Select({ name, options, defaultValue, required, empty }: { name: string; options: { value: string; label: string }[]; defaultValue?: string | null; required?: boolean; empty?: string }) {
  return (
    <select name={name} defaultValue={defaultValue ?? ''} required={required}>
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Submit({ children, tone = 'primary' }: { children: ReactNode; tone?: 'primary' | 'ghost' | 'danger' }) {
  return <button type="submit" className={`btn btn-${tone}`}>{children}</button>;
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="link">{children}</Link>;
}

export const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
export const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

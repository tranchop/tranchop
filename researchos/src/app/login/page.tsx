import { ErrorBanner } from '@/components/ErrorBanner';
import { Field } from '@/components/ui';
import { signIn, signUp } from './actions';

export default function LoginPage() {
  return (
    <main className="auth">
      <h1>ResearchOS</h1>
      <p className="muted">Ler → pensar → anotar → relacionar → testar → analisar → escrever.</p>
      <ErrorBanner />
      <form className="card" action={signIn}>
        <Field label="E-mail" name="email" type="email" required />
        <Field label="Senha" name="password" type="password" required />
        <div className="row">
          <button className="btn btn-primary" type="submit">Entrar</button>
          <button className="btn" type="submit" formAction={signUp}>Criar conta</button>
        </div>
      </form>
    </main>
  );
}

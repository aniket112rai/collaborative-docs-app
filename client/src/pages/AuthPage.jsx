import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
export default function AuthPage({ mode }) {
  const login = mode === 'login';
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const { setUser } = useAuth();
  const navigate = useNavigate();
  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post(`/auth/${login ? 'login' : 'register'}`, form);
      setUser(data.user);
      navigate('/dashboard');
    } catch (e) {
      setError(e.response?.data?.error || 'Unable to continue');
    }
  }
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-2xl"
      >
        <div>
          <p className="text-sm font-semibold text-violet-400">COLLAB NOTES</p>
          <h1 className="mt-2 text-3xl font-bold">
            {login ? 'Welcome back' : 'Create your workspace'}
          </h1>
        </div>
        {!login && (
          <input
            required
            placeholder="Your name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        )}
        <input
          required
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          required
          minLength="8"
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button className="primary w-full">
          {login ? 'Log in' : 'Create account'}
        </button>
        <p className="text-sm text-slate-400">
          {login ? 'New here?' : 'Already registered?'}{' '}
          <Link className="text-violet-400" to={login ? '/signup' : '/login'}>
            {login ? 'Sign up' : 'Log in'}
          </Link>
        </p>
      </form>
    </main>
  );
}

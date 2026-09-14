import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
export default function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (user === undefined)
    return <main className="grid min-h-screen place-items-center">Loading…</main>;
  return user ? children : <Navigate to="/login" replace />;
}

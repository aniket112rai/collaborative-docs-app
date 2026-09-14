import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
const AuthContext = createContext();
export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  useEffect(() => {
    api
      .get('/auth/me')
      .then(({ data }) => setUser(data.user))
      .catch(() => setUser(null));
  }, []);
  const value = {
    user,
    setUser,
    logout: async () => {
      await api.post('/auth/logout');
      setUser(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

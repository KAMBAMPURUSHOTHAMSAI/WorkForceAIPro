import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import api, {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  storeTokens,
} from "../api/axios";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();

    try {
      if (refreshToken) {
        await api.post("/auth/logout", {
          refresh_token: refreshToken,
        });
      }
    } catch {
      // Clear local session even if the API is unavailable.
    } finally {
      clearTokens();
      setUser(null);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    const formData = new URLSearchParams();

    formData.set("username", email.trim());
    formData.set("password", password);

    const response = await api.post("/auth/login", formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    storeTokens(response.data);

    try {
      const profile = await api.get("/auth/me");
      setUser(profile.data);
      return profile.data;
    } catch (error) {
      clearTokens();
      throw error;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const response = await api.get("/auth/me");
    setUser(response.data);
    return response.data;
  }, []);

  useEffect(() => {
    let mounted = true;

    const handleExpiredSession = () => {
      if (mounted) {
        setUser(null);
        setLoading(false);
      }
    };

    window.addEventListener(
      "workforce:auth-expired",
      handleExpiredSession
    );

    async function initializeAuth() {
      if (!getAccessToken() && !getRefreshToken()) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.get("/auth/me");

        if (mounted) {
          setUser(response.data);
        }
      } catch {
        clearTokens();

        if (mounted) {
          setUser(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    initializeAuth();

    return () => {
      mounted = false;

      window.removeEventListener(
        "workforce:auth-expired",
        handleExpiredSession
      );
    };
  }, []);

  const value = {
    user,
    loading,
    login,
    logout,
    refreshProfile,
    isAuthenticated: Boolean(user),
    hasToken: Boolean(getAccessToken()),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// This context module intentionally exports the custom hook alongside its provider.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
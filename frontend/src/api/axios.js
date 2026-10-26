import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8010/api/v1";

const ACCESS_KEY = "workforce_access_token";
const REFRESH_KEY = "workforce_refresh_token";

export const getAccessToken = () =>
  localStorage.getItem(ACCESS_KEY);

export const getRefreshToken = () =>
  localStorage.getItem(REFRESH_KEY);

export const storeTokens = (tokens) => {
  if (tokens?.access_token) {
    localStorage.setItem(ACCESS_KEY, tokens.access_token);
  }

  if (tokens?.refresh_token) {
    localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
  }
};

export const clearTokens = (notify = false) => {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);

  if (notify) {
    window.dispatchEvent(new Event("workforce:auth-expired"));
  }
};

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

let refreshPromise = null;

api.interceptors.request.use(
  (config) => {
    const token = getAccessToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest = error.config;
    const requestUrl = originalRequest?.url || "";

    const authEndpoints = [
      "/auth/login",
      "/auth/register",
      "/auth/refresh",
      "/auth/logout",
      "/auth/forgot-password",
      "/auth/reset-password",
    ];

    const isAuthEndpoint = authEndpoints.some((path) =>
      requestUrl.includes(path)
    );

    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      isAuthEndpoint
    ) {
      return Promise.reject(error);
    }

    const refreshToken = getRefreshToken();

    if (!refreshToken) {
      clearTokens(true);
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = axios
          .post(
            `${API_BASE_URL}/auth/refresh`,
            { refresh_token: refreshToken },
            { timeout: 15000 }
          )
          .then((response) => {
            storeTokens(response.data);
            return response.data.access_token;
          })
          .catch((refreshError) => {
            clearTokens(true);
            throw refreshError;
          })
          .finally(() => {
            refreshPromise = null;
          });
      }

      const newAccessToken = await refreshPromise;

      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization =
        `Bearer ${newAccessToken}`;

      return api(originalRequest);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  }
);

export default api;
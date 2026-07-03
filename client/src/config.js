const trimApiBase = (value) => value?.replace(/\/+$/, "").replace(/\/api$/, "");

export const API_ORIGIN = trimApiBase(
  import.meta.env.VITE_VARUNA_API_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    "http://localhost:8080"
);

export const API_BASE_URL = `${API_ORIGIN}/api`;

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export const GOOGLE_AUTH_ENABLED = Boolean(GOOGLE_CLIENT_ID);

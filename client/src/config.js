const trimApiBase = (value) => value?.replace(/\/+$/, "").replace(/\/api$/, "");

export const API_ORIGIN = trimApiBase(
  import.meta.env.VITE_VARUNA_API_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    "http://localhost:8080"
);

console.log(import.meta.env.VITE_VARUNA_API_URL);
console.log(import.meta.env.VITE_BACKEND_URL);
console.log("API_ORIGIN:", API_ORIGIN);
console.log("API_BASE_URL:", API_BASE_URL);
console.log("AUTH_BASE_URL:", AUTH_BASE_URL);
console.log("VITE_AUTH_URL:", import.meta.env.VITE_AUTH_URL);


export const API_BASE_URL = `${API_ORIGIN}/api`;

// Separate origin for the standalone Node auth server (google-login quickfix).
// Falls back to API_BASE_URL if not set, so nothing breaks if you don't use it.
const AUTH_ORIGIN = trimApiBase(import.meta.env.VITE_AUTH_URL) || API_ORIGIN;
export const AUTH_BASE_URL = `${AUTH_ORIGIN}/api`;

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export const GOOGLE_AUTH_ENABLED = Boolean(GOOGLE_CLIENT_ID);
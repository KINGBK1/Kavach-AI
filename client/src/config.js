const trimApiBase = (value) => value?.replace(/\/+$/, "").replace(/\/api$/, "");

export const API_ORIGIN = trimApiBase(
  import.meta.env.VITE_VARUNA_API_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    "http://localhost:8080"
);

// console.log(import.meta.env.VITE_VARUNA_API_URL);
// console.log(import.meta.env.VITE_BACKEND_URL);
// console.log("API_ORIGIN:", API_ORIGIN);
// console.log("API_BASE_URL:", API_BASE_URL);
// console.log("AUTH_BASE_URL:", AUTH_BASE_URL);
// console.log("VITE_AUTH_URL:", import.meta.env.VITE_AUTH_URL);


export const API_BASE_URL = `${API_ORIGIN}/api`;

// Separate origin for the standalone Node auth server (google-login quickfix).
// Falls back to API_BASE_URL if not set, so nothing breaks if you don't use it.
const AUTH_ORIGIN = trimApiBase(import.meta.env.VITE_AUTH_URL) || API_ORIGIN;
export const AUTH_BASE_URL = `${AUTH_ORIGIN}/api`;

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export const GOOGLE_AUTH_ENABLED = Boolean(GOOGLE_CLIENT_ID);

// ===========================================================================
// TEMPORARY — HACKATHON JUDGING WINDOW ONLY
// ===========================================================================
// When true, the frontend shows admin-only UI (Admin Panel nav link) to
// every logged-in user, matching the backend's own KAVACH_JUDGING_MODE
// override — so a judge signing in with their own Google account, not the
// pre-made judge-demo account, still sees every feature.
//
// TO REVERT AFTER JUDGING: set VITE_JUDGING_MODE=false (or remove it) and
// redeploy. Consider deleting this flag and its usages entirely once the
// judging window is over.
export const JUDGING_MODE = import.meta.env.VITE_JUDGING_MODE === "true";
// ===========================================================================
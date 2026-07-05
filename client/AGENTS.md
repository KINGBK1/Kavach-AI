# KAVACH Client — React Frontend

## Tech Stack

- **React 19** with JSX, **Vite 7** bundler, **React Router DOM 7** (hash-free SPA)
- **Recharts** for all dashboard charts, **Leaflet + react-leaflet** for the live map
- **Axios** with JWT interceptor for API calls, **js-cookie** for token persistence
- **lucide-react** icons, no Tailwind — custom CSS per component

## Structure

```
src/
├── main.jsx                   Entry point
├── App.jsx                    Root with routing
├── config.js                  Env-based API URLs
├── api/
│   ├── axios.js               Axios instance + JWT interceptor
│   └── varunaApi.js           All backend API calls (single module)
├── utils/
│   └── geolocation.js         Reverse geocode via Nominatim
└── components/
    ├── Auth/                  SignIn, SignUp, TriColorAnimation, ProtectedRoute
    │   └── context/           AuthContext, authContextValue (JWT + user state)
    ├── Dashboard/             UserDashboard, Navbar (KPI cards, charts)
    ├── Map/                   LiveMap (Leaflet), ProximityAlertModal
    ├── Reports/               Reports.jsx (incident list table)
    ├── Chat/                  Chat.jsx (AI Q&A)
    ├── Alerts/                Alerts.jsx (critical/high alert dashboard)
    ├── Profile/               ProfileSettings.jsx
    ├── Footer/                Footer.jsx
    ├── Layout/                PageShell.jsx (navbar + footer wrapper)
    └── common/                Severity badge, InfoTooltip, severityConfig, varunaCommon.css
```

## API Patterns

- All API calls go through `src/api/varunaApi.js` — never call axios directly in components
- `getDashboard()` has a 60-second in-memory cache shared across Dashboard/Map/Alerts
- `getIncidents()` / `getAnalyzedIncidents()` for raw/analyzed incident data
- `askAI(question)` for chat, `submitReport(...)` for citizen reports
- Use `invalidateDashboardCache()` after submitting a new report
- Axios instance in `api/axios.js` auto-attaches `Bearer <token>` from cookie

## CSS Conventions

- BEM-like naming: `.v-premium-kpi-card`, `.v-card-header-context`, `.v-mono`
- Each component has its own CSS file imported at top of JSX
- CSS custom properties for severity colours (`--sev-critical`, `--sev-high`, etc.)
- JetBrains Mono font for monospace elements (`.v-mono`)
- Skeletons shown while loading; empty-state cards when no data

## Routing

All authenticated routes use `<PageShell>` wrapper (navbar + footer + optional sidebar). Protected via `<ProtectedRoute>`. Routes: `/dashboard`, `/map`, `/alerts`, `/reports`, `/chat`, `/profile`.

## Code Conventions

- Functional components with hooks (`useState`, `useEffect`, `useMemo`, `useCallback`)
- Destructure imports from lucide-react for icons
- Import order: React → third-party → internal modules → CSS → assets
- `export default` at bottom of file
- No comments in source code

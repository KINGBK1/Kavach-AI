# KAVACH Client — React 19 / Vite Frontend

## Tech Stack

- **React 19** with **Vite 7**
- **React Router DOM 7** for routing
- **Leaflet** + **react-leaflet** + **react-leaflet-cluster** for maps
- **Recharts** for dashboard charts
- **Axios** for HTTP with interceptors
- **Lucide React** for icons
- **@react-oauth/google** for Google Sign-In
- **js-cookie** + **jwt-decode** for token management

## Structure

```
client/
├── index.html
├── vite.config.js
├── package.json
├── vercel.json
├── eslint.config.js
└── src/
    ├── main.jsx                    React entry (StrictMode + App)
    ├── App.jsx                     Root: Router, AuthProvider, GoogleOAuthProvider
    ├── index.css                   Global styles
    ├── config.js                   API URL, Google Client ID
    ├── api/
    │   ├── axios.js                Axios instance with JWT interceptor
    │   └── varunaApi.js            All API calls (getIncidents, getDashboard, askAI, submitReport...)
    ├── assets/                     Static images (kerala-backwaters, varuna logo, etc.)
    ├── components/
    │   ├── Alerts/                 Incident list with filters + sorting
    │   ├── Auth/
    │   │   ├── context/            AuthContext + authContextValue
    │   │   ├── SignIn/             Sign-in page
    │   │   ├── SignUp/             Sign-up page
    │   │   ├── ProtectedRoute.jsx  Route guard
    │   │   └── TriColorAnimation/  Animated background
    │   ├── Chat/                   AI chat interface
    │   ├── common/                 Shared: InfoTooltip, Severity badge, severityConfig
    │   ├── Dashboard/              User dashboard + Navbar
    │   ├── Footer/                 App footer
    │   ├── Layout/                 PageShell wrapper
    │   ├── Map/                    LiveMap + ProximityAlertModal
    │   ├── Profile/                ProfileSettings
    │   └── Reports/                Submit/view incident reports
    └── utils/
        └── geolocation.js          Browser geolocation helper
```

## Pages / Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/signin` | SignIn | Login (email + Google) |
| `/signup` | SignUp | Register new account |
| `/` | UserDashboard | Stats, charts, critical incidents |
| `/map` | LiveMap | Interactive map with satellite/terrain/default layers |
| `/alerts` | Alerts | Filterable, sortable incident list |
| `/reports` | Reports | View & submit incident reports |
| `/chat` | Chat | AI-powered Q&A over incidents |
| `/profile` | ProfileSettings | Update location, preferences |

## Auth Flow

1. **Local:** Register/Login → JWT stored in cookie → `AuthContext` reads token
2. **Google:** `@react-oauth/google` → send ID token to backend → receive JWT
3. **Axios interceptor** attaches `Authorization: Bearer <token>` to every request
4. **ProtectedRoute** redirects to `/signin` if no valid token

## API Endpoints Used

All proxied through the Rust backend:

| Function | Endpoint |
|----------|----------|
| Login | `POST /api/auth/login` |
| Register | `POST /api/auth/register` |
| Google Login | `POST /api/auth/google-login` |
| Get Incidents | `GET /api/incidents` |
| Submit Report | `POST /api/incidents/report` |
| Dashboard Stats | `GET /api/dashboard/*` |
| AI Chat | `POST /api/chat` |
| Profile | `GET /api/auth/profile` |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | required | Backend API base URL |
| `VITE_GOOGLE_CLIENT_ID` | required | Google OAuth client ID |

## Scripts

```bash
npm run dev      # Vite dev server on :5173
npm run build    # Production build to dist/
npm run preview  # Preview production build
npm run lint     # ESLint check
```

## Code Conventions

- Functional components with hooks
- CSS files co-located with components (no CSS-in-JS)
- No comments in source code
- Axios instance with response interceptor for error handling

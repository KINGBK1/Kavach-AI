import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import SignUpPage from './components/Auth/SignUp/SignUp';
import { GoogleOAuthProvider } from '@react-oauth/google';
import SignIn from './components/Auth/SignIn/SignIn';
import { AuthProvider } from './components/Auth/context/AuthContext';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import { GOOGLE_AUTH_ENABLED, GOOGLE_CLIENT_ID } from './config';
import ForgotPassword from './components/Auth/ForgotPassword/ForgotPassword';

const UserDashboard = lazy(() => import('./components/Dashboard/UserDashboard'));
const LiveMap = lazy(() => import('./components/Map/LiveMap'));
const Alerts = lazy(() => import('./components/Alerts/Alerts'));
const Reports = lazy(() => import('./components/Reports/Reports'));
const Chat = lazy(() => import('./components/Chat/Chat'));
const ProfileSettings = lazy(() => import('./components/Profile/ProfileSettings'));

const PageLoader = () => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100vh', fontFamily: 'inherit', color: '#94a3b8', fontSize: '14px',
    flexDirection: 'column', gap: '12px'
  }}>
    <div style={{
      width: '24px', height: '24px', border: '2.5px solid #e2e8f0',
      borderTopColor: '#1e40af', borderRadius: '50%',
      animation: 'spin 0.7s linear infinite'
    }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    <span>Loading...</span>
  </div>
);

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Frontend render failed:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="v-fatal-screen">
          <div className="v-fatal-card">
            <h1>VARUNA could not load this screen</h1>
            <p>{this.state.error.message || "A frontend runtime error occurred."}</p>
            <button className="v-btn v-btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const Providers = ({ children }) => {
  if (!GOOGLE_AUTH_ENABLED) {
    return children;
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      {children}
    </GoogleOAuthProvider>
  );
};

const App = () => {
  return (
    <AppErrorBoundary>
      <Providers>
        <AuthProvider>
          <Router>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Public Routes */}
                <Route path="/signup" element={<SignUpPage />} />
                <Route path="/signin" element={<SignIn />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                
                {/* Root Redirect */}
                <Route path="/" element={<Navigate to="/dashboard" replace />} />

                {/* Protected Routes */}
                <Route path="/dashboard" element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
                <Route path="/map" element={<ProtectedRoute><LiveMap /></ProtectedRoute>} />
                <Route path="/alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
                <Route path="/incidents" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
                <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
                <Route path="/profile-settings" element={<ProtectedRoute><ProfileSettings /></ProtectedRoute>} />
                
                {/* Redirects and Fallbacks */}
                <Route path="/reports" element={<Navigate to="/incidents" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </Router>
        </AuthProvider>
      </Providers>
    </AppErrorBoundary>
  );
};

export default App;

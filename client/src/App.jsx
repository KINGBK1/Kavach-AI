import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import SignUpPage from './components/Auth/SignUp/SignUp';
import { GoogleOAuthProvider } from '@react-oauth/google';
import UserDashboard from './components/Dashboard/UserDashboard';
import SignIn from './components/Auth/SignIn/SignIn';
import Reports from './components/Reports/Reports';
import { AuthProvider } from './components/Auth/context/AuthContext';
import LiveMap from './components/Map/LiveMap';
import Alerts from './components/Alerts/Alerts';
import ProfileSettings from './components/Profile/ProfileSettings';
import Chat from './components/Chat/Chat';
import { GOOGLE_AUTH_ENABLED, GOOGLE_CLIENT_ID } from './config';

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
            <Routes>
              <Route path="/signup" element={<SignUpPage />} />
              <Route path="/signin" element={<SignIn />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<UserDashboard />} />
              <Route path="/map" element={<LiveMap />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/incidents" element={<Reports />} />
              <Route path="/reports" element={<Navigate to="/incidents" replace />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/profile-settings" element={<ProfileSettings />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Router>
        </AuthProvider>
      </Providers>
    </AppErrorBoundary>
  );
};

export default App;

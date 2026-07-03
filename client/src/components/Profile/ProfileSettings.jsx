import React, { useContext } from "react";
import { LogOut, Mail, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../Auth/context/authContextValue";
import PageShell from "../Layout/PageShell";
import "./ProfileSettings.css";

/**
 * Note: the previous version of this page read/wrote /api/user/* endpoints
 * (profile, password, preferences, account deletion). Those aren't part of
 * the new backend spec, so this is intentionally a lean account summary
 * until user-management endpoints exist on the new API.
 */
const ProfileSettings = () => {
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);

  const handleLogout = () => {
    logout();
    navigate("/signin");
  };

  return (
    <PageShell noFooter>
      <div className="v-dash-header">
        <div>
          <h1 className="v-dash-title">Profile</h1>
          <p className="v-dash-subtitle">Your account details.</p>
        </div>
      </div>

      <div className="v-panel v-profile-card">
        <div className="v-profile-avatar">
          {user?.avatar ? (
            <img src={user.avatar} alt={user.name} />
          ) : (
            <span>{(user?.name || "U").charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="v-profile-info">
          <h3>{user?.name || "Loading…"}</h3>
          <div className="v-profile-row"><Mail size={14} /> {user?.email || "—"}</div>
          <div className="v-profile-row"><Shield size={14} /> {user?.role || "user"}</div>
        </div>
        <button className="v-btn" onClick={handleLogout}>
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </PageShell>
  );
};

export default ProfileSettings;

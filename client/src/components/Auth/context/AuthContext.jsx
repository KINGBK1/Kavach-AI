// src/context/AuthContext.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import Cookies from "js-cookie";
import { API_BASE_URL } from "../../../config";
import { AuthContext } from "./authContextValue";
import { updateProfile } from "../../../api/varunaApi";

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);
  const geolocationAttempted = useRef(false);

  const fetchUser = useCallback(async () => {
    const token = Cookies.get("token");
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/auth/status`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) {
          Cookies.remove("token", { path: "/" });
          setIsAuthenticated(false);
        }
        return;
      }
      const data = await res.json();
      const userData = data.user || data;
      setUser({
        name: userData.name || userData.username || "User",
        email: userData.email || "",
        id: userData.id || userData._id || "unknown",
        avatar: userData.avatar || userData.picture || userData.profilePicture || null,
        role: userData.role || "user",
        latitude: userData.latitude ?? null,
        longitude: userData.longitude ?? null,
        preferences: userData.preferences || { emailAlerts: true },
      });
    } catch (err) {
      console.error("Error fetching user:", err);
    }
  }, []);

  // Check for the token on the initial load of the app
  useEffect(() => {
    const token = Cookies.get("token");
    if (token) {
      setIsAuthenticated(true);
      fetchUser();
    }
    setIsLoading(false);
  }, [fetchUser]);

  const login = (token) => {
    Cookies.set("token", token, { expires: 7, path: "/" });
    setIsAuthenticated(true);
    fetchUser();
  };

  const [locationPromptNeeded, setLocationPromptNeeded] = useState(false);

  useEffect(() => {
    if (!user || (user.latitude != null && user.longitude != null)) {
      setLocationPromptNeeded(false);
      return;
    }
    if (geolocationAttempted.current) return;
    geolocationAttempted.current = true;

    if (!window.isSecureContext) {
      // Most browsers refuse to even show the permission prompt outside
      // HTTPS/localhost — getCurrentPosition would fail immediately here,
      // so there's nothing to auto-retry; surface it as a manual action
      // instead (Profile Settings' "Detect Location" button still works
      // once the site is actually served over HTTPS).
      console.warn("[AuthContext] Skipping geolocation auto-capture: not a secure context (HTTPS required).");
      setLocationPromptNeeded(true);
      return;
    }

    if (!navigator.geolocation) {
      setLocationPromptNeeded(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await updateProfile({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            preferences: user.preferences || { emailAlerts: true },
          });
          if (res.user) {
            setUser((prev) => ({
              ...prev,
              latitude: res.user.latitude,
              longitude: res.user.longitude,
            }));
          }
          setLocationPromptNeeded(false);
        } catch (e) {
          console.error("[AuthContext] Auto-save location failed:", e);
          setLocationPromptNeeded(true);
        }
      },
      (err) => {
        // Permission denied, timeout, or position unavailable all land
        // here. Previously this just logged and gave up forever for the
        // rest of the session — now we surface it so the user has a
        // visible, retryable path (see LocationPermissionBanner) instead
        // of silently never being alertable.
        console.error("[AuthContext] geolocation error:", err.message);
        setLocationPromptNeeded(true);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [user]);

  const retryLocationCapture = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await updateProfile({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            preferences: user?.preferences || { emailAlerts: true },
          });
          if (res.user) {
            setUser((prev) => ({
              ...prev,
              latitude: res.user.latitude,
              longitude: res.user.longitude,
            }));
          }
          setLocationPromptNeeded(false);
        } catch (e) {
          console.error("[AuthContext] Retry location save failed:", e);
        }
      },
      (err) => console.error("[AuthContext] Retry geolocation error:", err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [user]);

  const logout = () => {
    Cookies.remove("token", { path: "/" });
    setIsAuthenticated(false);
    setUser(null);
    geolocationAttempted.current = false;
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, logout, setUser, locationPromptNeeded, retryLocationCapture }}>
      {children}
    </AuthContext.Provider>
  );
};
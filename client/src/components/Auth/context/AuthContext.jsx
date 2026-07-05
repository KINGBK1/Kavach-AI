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

  useEffect(() => {
    console.log("[AuthContext] geolocation useEffect fired, lat:", user?.latitude, "lng:", user?.longitude);
    if (!user || (user.latitude != null && user.longitude != null)) return;
    if (geolocationAttempted.current) return;
    geolocationAttempted.current = true;
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        console.log("[AuthContext] geolocation obtained:", pos.coords.latitude, pos.coords.longitude);
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
        } catch (e) {
          console.error("[AuthContext] Auto-save location failed:", e);
        }
      },
      (err) => console.error("[AuthContext] geolocation error:", err.message),
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
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

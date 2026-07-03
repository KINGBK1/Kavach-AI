// src/context/AuthContext.jsx
import React, { useEffect, useState, useCallback } from "react";
import Cookies from "js-cookie";
import { API_BASE_URL } from "../../../config";
import { AuthContext } from "./authContextValue";

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);

  const fetchUser = useCallback(async () => {
    const token = Cookies.get("token");
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/auth/health`, {
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

  const logout = () => {
    Cookies.remove("token", { path: "/" });
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

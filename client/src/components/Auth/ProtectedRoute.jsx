import React, { useContext } from "react";
import { Navigate } from "react-router-dom";
import { AuthContext } from "./context/authContextValue";

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useContext(AuthContext);

  if (isLoading) {
    // Show a loading screen while we check for the token
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/signin" replace />;
  }

  return children;
};

export default ProtectedRoute;

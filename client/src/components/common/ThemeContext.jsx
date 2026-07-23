import React, { createContext, useContext } from "react";

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => children;

export const useTheme = () => ({ theme: "light", toggleTheme: () => {} });
export default ThemeContext;
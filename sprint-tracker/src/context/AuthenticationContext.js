// context/AuthContext.js
import React, { createContext, useState } from "react";
export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { name, role }

  const login = (username, password) => {
    // Replace with real auth in production
    if(username === "admin") setUser({ name: "Admin", role: "admin" });
    else setUser({ name: username, role: "user" });
  };

  return <AuthContext.Provider value={{ user, login }}>
    {children}
  </AuthContext.Provider>
}
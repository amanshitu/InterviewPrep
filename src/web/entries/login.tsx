import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles/globals.css";
import { Login } from "../routes/auth/Login";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <Login />
  </StrictMode>,
);

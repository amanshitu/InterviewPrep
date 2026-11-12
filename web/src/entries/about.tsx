import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AboutPage } from "../pages/AboutPage";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <AboutPage />
  </StrictMode>,
);

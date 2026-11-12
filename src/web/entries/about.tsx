import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles/globals.css";
import { About } from "../routes/public/About";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <About />
  </StrictMode>,
);

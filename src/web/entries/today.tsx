import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles/globals.css";
import { Today } from "../routes/app/Today";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <Today />
  </StrictMode>,
);

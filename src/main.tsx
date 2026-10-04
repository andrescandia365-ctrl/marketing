import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { RenderPage } from "./RenderPage.tsx";
import "./styles.css";

// render.mjs opens /?render=<project>&format=…: the bare frame painter, without the app around it.
const params = new URLSearchParams(location.search);
const render = params.get("render");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {render ? <RenderPage projectId={render} format={params.get("format") === "horizontal" ? "horizontal" : "vertical"} /> : <App />}
  </StrictMode>,
);

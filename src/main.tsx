import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

// The app and the render page are separate downloads: render.mjs never loads the app, and the app never loads the
// frame painter until a studio opens.
const App = lazy(() => import("./App.tsx").then((m) => ({ default: m.App })));
const RenderPage = lazy(() => import("./RenderPage.tsx").then((m) => ({ default: m.RenderPage })));

// render.mjs opens /?render=<project>&format=…: the bare frame painter, without the app around it.
const params = new URLSearchParams(location.search);
const render = params.get("render");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={null}>
      {render ? <RenderPage projectId={render} format={params.get("format") === "horizontal" ? "horizontal" : "vertical"} /> : <App />}
    </Suspense>
  </StrictMode>,
);

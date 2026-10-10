import { Component, StrictMode, Suspense, lazy, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

// The app and the render page are separate downloads: render.mjs never loads the app, and the app never loads the
// frame painter until a studio opens.
const App = lazy(() => import("./App.tsx").then((m) => ({ default: m.App })));
const RenderPage = lazy(() => import("./RenderPage.tsx").then((m) => ({ default: m.RenderPage })));

// If the app itself never arrives (rebuilt while the tab was open, connection dropped), say so instead of a blank page.
// Kept here, without the app's components, so the first download stays this small.
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="m-6 rounded-lg border border-neg/40 bg-neg-soft px-4 py-3 text-sm text-neg">
        No se pudo mostrar la app: puede que se haya actualizado, que se cortara la conexión o que algo fallara.{" "}
        <button type="button" className="font-semibold underline" onClick={() => location.reload()}>
          Recargar la página
        </button>
      </div>
    );
  }
}

// render.mjs opens /?render=<project>&format=…: the bare frame painter, without the app around it.
const params = new URLSearchParams(location.search);
const render = params.get("render");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Boundary>
      <Suspense fallback={null}>
        {render ? <RenderPage projectId={render} format={params.get("format") === "horizontal" ? "horizontal" : "vertical"} /> : <App />}
      </Suspense>
    </Boundary>
  </StrictMode>,
);

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if (typeof window !== "undefined") {
  const preventGestureZoom = (event: Event) => {
    event.preventDefault();
  };

  const preventCtrlZoom = (event: WheelEvent) => {
    if (event.ctrlKey) {
      event.preventDefault();
    }
  };

  window.addEventListener("gesturestart", preventGestureZoom, { passive: false });
  window.addEventListener("gesturechange", preventGestureZoom, { passive: false });
  window.addEventListener("gestureend", preventGestureZoom, { passive: false });
  window.addEventListener("wheel", preventCtrlZoom, { passive: false });
}

createRoot(document.getElementById("root")!).render(<App />);

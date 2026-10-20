import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { router } from "./routes/router.tsx";
import { loadSession } from "./stores/session.ts";
import { initTheme } from "./stores/theme.ts";
import "./styles.css";

initTheme();
void loadSession();
createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);

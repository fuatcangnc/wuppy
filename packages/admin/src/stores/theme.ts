import { atom } from "nanostores";

export interface ThemePreset {
	id: string;
	label: string;
	light: string;
	dark: string;
	fgLight: string;
	fgDark: string;
}

export const PRESETS: ThemePreset[] = [
	{ id: "kumo", label: "Kumo blue", light: "#056dff", dark: "#005aeb", fgLight: "#f2f8ff", fgDark: "#f2f8ff" },
	{ id: "indigo", label: "Indigo", light: "#4f46e5", dark: "#818cf8", fgLight: "#ffffff", fgDark: "#0b0b0f" },
	{ id: "emerald", label: "Emerald", light: "#047857", dark: "#34d399", fgLight: "#ffffff", fgDark: "#04120c" },
	{ id: "rose", label: "Rose", light: "#be123c", dark: "#fb7185", fgLight: "#ffffff", fgDark: "#1a0508" },
	{ id: "amber", label: "Amber", light: "#b45309", dark: "#fbbf24", fgLight: "#ffffff", fgDark: "#1c1204" },
	{ id: "violet", label: "Violet", light: "#6d28d9", dark: "#a78bfa", fgLight: "#ffffff", fgDark: "#12081f" },
] as const;

export type Mode = "light" | "dark" | "system";

export const RADII = [
	{ label: "None", value: "0rem" },
	{ label: "Small", value: "0.375rem" },
	{ label: "Medium", value: "0.625rem" },
	{ label: "Large", value: "0.75rem" },
	{ label: "Extra large", value: "1rem" },
] as const;

const savedTheme = typeof localStorage === "undefined" ? "kumo" : localStorage.getItem("wuppy.theme") ?? "kumo";
const savedMode = typeof localStorage === "undefined" ? "dark" : (localStorage.getItem("wuppy.mode") as Mode) ?? "dark";
const savedRadius = typeof localStorage === "undefined" ? "0.625rem" : localStorage.getItem("wuppy.radius") ?? "0.625rem";

export const $theme = atom(savedTheme);
export const $mode = atom<Mode>(savedMode);
export const $radius = atom(savedRadius);

/** One place that writes design tokens. Components consume vars only. */
export function applyTheme(id = $theme.get(), mode = $mode.get()): void {
	if (typeof document === "undefined") return;
	const preset = PRESETS.find((item) => item.id === id) ?? PRESETS[0]!;
	const root = document.documentElement;
	const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
	root.classList.toggle("dark", dark);
	root.style.setProperty("--primary", dark ? preset.dark : preset.light);
	root.style.setProperty("--primary-foreground", dark ? preset.fgDark : preset.fgLight);
	root.style.setProperty("--ring", dark ? preset.dark : preset.light);
	root.style.setProperty("--radius", $radius.get());
	root.style.colorScheme = dark ? "dark" : "light";
	root.dataset.mode = dark ? "dark" : "light";
	root.dataset.theme = preset.id;
}

export function setTheme(id: string): void {
	$theme.set(id);
	localStorage.setItem("wuppy.theme", id);
	applyTheme(id, $mode.get());
}

export function setMode(mode: Mode): void {
	$mode.set(mode);
	localStorage.setItem("wuppy.mode", mode);
	applyTheme($theme.get(), mode);
}

export function setRadius(value: string): void {
	$radius.set(value);
	localStorage.setItem("wuppy.radius", value);
	applyTheme();
}

export function cycleTheme(): void {
	const index = PRESETS.findIndex((item) => item.id === $theme.get());
	setTheme(PRESETS[(index + 1) % PRESETS.length]!.id);
}

export function initTheme(): void {
	applyTheme();
	if (typeof matchMedia !== "undefined") {
		matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme());
	}
}

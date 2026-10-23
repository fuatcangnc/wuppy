import { Plus, Trash2 } from "@react-zero-ui/icon-sprite";
import { useStore } from "@nanostores/react";
import { useState } from "react";
import { AUG_FOURTH, fluidScale, frameworkSchema, TYPE_RATIOS, type Framework, type Scale } from "@wuppy/visual-editor";
import { Button, IconButton, Input, Select, Switch, Tabs } from "../../ui/index.tsx";
import { Section } from "./Explorer.tsx";
import { $visual, mutateVisual } from "./store.ts";

/** Change the framework; `key` groups typing in one field into one undo step. */
const edit = (fn: (fw: Framework) => void, key: string) => mutateVisual((v) => fn(v.framework), `fw:${key}`);
const num = (raw: string, fallback: number) => (Number.isFinite(Number(raw)) && raw !== "" ? Number(raw) : fallback);

function ScaleEditor({ name, scale, fw }: { name: "type" | "space"; scale: Scale; fw: Framework }) {
	const set = (patch: Partial<Scale>, key: string) => edit((f) => Object.assign(f[name], patch), `${name}:${key}`);
	const ratios = name === "type" ? TYPE_RATIOS : ([1.067, 1.125, 1.2, 1.25, 1.333, AUG_FOURTH, 1.5, 1.618, 2] as const);
	return (
		<Section title={name === "type" ? "Type scale" : "Space scale"}>
			<div className="grid grid-cols-2 gap-2">
				<Input
					label="Min size (px)"
					type="number"
					value={scale.minSize}
					onChange={(e) => set({ minSize: num(e.target.value, scale.minSize) }, "minSize")}
					className="h-8 text-xs"
				/>
				<Select
					size="sm"
					label="Min ratio"
					value={String(scale.minRatio)}
					onChange={(e) => set({ minRatio: Number(e.target.value) }, "minRatio")}
				>
					{ratios.map((r) => (
						<option key={r} value={String(r)}>
							{r}
						</option>
					))}
				</Select>
				<Input
					label="Max size (px)"
					type="number"
					value={scale.maxSize}
					onChange={(e) => set({ maxSize: num(e.target.value, scale.maxSize) }, "maxSize")}
					className="h-8 text-xs"
				/>
				<Select
					size="sm"
					label="Max ratio"
					value={String(scale.maxRatio)}
					onChange={(e) => set({ maxRatio: Number(e.target.value) }, "maxRatio")}
				>
					{ratios.map((r) => (
						<option key={r} value={String(r)}>
							{r}
						</option>
					))}
				</Select>
			</div>
			<Input
				label="Steps (smallest first)"
				value={scale.steps}
				onChange={(e) => set({ steps: e.target.value.replace(/\s+/g, "") }, "steps")}
				className="h-8 font-mono text-xs"
			/>
			<Select
				size="sm"
				label="Base step"
				value={String(scale.base)}
				onChange={(e) => set({ base: Number(e.target.value) }, "base")}
			>
				{scale.steps.split(",").map((s, i) => (
					<option key={`${s}${i}`} value={String(i)}>
						{s}
					</option>
				))}
			</Select>
			<Switch
				label="Utility classes"
				checked={scale.utilities}
				onChange={(e) => set({ utilities: e.target.checked }, "utilities")}
			/>
			<table className="w-full text-[11px]">
				<tbody>
					{fluidScale(scale, fw).map(([step, value]) => (
						<tr key={step}>
							<td className="pr-2 font-mono">
								--{fw.prefix}
								{name === "type" ? "text" : "space"}-{step}
							</td>
							<td className="text-muted-foreground">{value.replace(/^clamp\(|\)$/g, "").split(", ")[0]}…</td>
						</tr>
					))}
				</tbody>
			</table>
		</Section>
	);
}

/** Instatic's Framework panel: color tokens, fluid type and space scales, fonts, and global preferences. */
export function FrameworkPanel() {
	const visual = useStore($visual);
	const fw = visual.framework;
	const check = frameworkSchema.safeParse(fw);
	const [tab, setTab] = useState<"overview" | "colors" | "type" | "space">("overview");
	return (
		<div>
			<div className="border-b border-border p-2">
				<Tabs
					value={tab}
					onChange={setTab}
					stretch
					items={[
						{ value: "overview", label: "Overview" },
						{ value: "colors", label: "Colors" },
						{ value: "type", label: "Type" },
						{ value: "space", label: "Space" },
					]}
				/>
			</div>
			{!check.success && (
				<p className="m-3 rounded bg-destructive/10 p-2 text-xs text-destructive">
					{check.error.issues[0]?.path.join(".")}: {check.error.issues[0]?.message}. Fix this before saving.
				</p>
			)}
			{tab === "overview" && (
				<Section title="Preferences">
					<div className="grid grid-cols-2 gap-2">
						<Input
							label="Prefix"
							value={fw.prefix}
							onChange={(e) => edit((f) => void (f.prefix = e.target.value), "prefix")}
							className="h-8 font-mono text-xs"
						/>
						<Input
							label="Root font size"
							type="number"
							value={fw.rootFontSize}
							onChange={(e) => edit((f) => void (f.rootFontSize = num(e.target.value, f.rootFontSize)), "root")}
							className="h-8 text-xs"
						/>
						<Input
							label="Min screen (px)"
							type="number"
							value={fw.minWidth}
							onChange={(e) => edit((f) => void (f.minWidth = num(e.target.value, f.minWidth)), "minWidth")}
							className="h-8 text-xs"
						/>
						<Input
							label="Max screen (px)"
							type="number"
							value={fw.maxWidth}
							onChange={(e) => edit((f) => void (f.maxWidth = num(e.target.value, f.maxWidth)), "maxWidth")}
							className="h-8 text-xs"
						/>
					</div>
					<p className="text-[11px] text-muted-foreground">
						Scales grow fluidly between the min and max screen widths. Everything is emitted as --{fw.prefix}… variables
						and .{fw.prefix}… classes.
					</p>
				</Section>
			)}
			{tab === "colors" && (
				<Section
					title="Colors"
					action={
						<IconButton
							label="Add color"
							size="icon-sm"
							onClick={() =>
								edit(
									(f) =>
										void f.colors.push({
											name: `color-${f.colors.length + 1}`,
											value: "#888888",
											shades: 0,
											tints: 0,
											transparent: false,
											utilities: true,
										}),
									"add-color",
								)
							}
						>
							<Plus size={14} />
						</IconButton>
					}
				>
					{fw.colors.map((c, i) => (
						<details key={i} className="rounded border border-border p-2 text-xs">
							<summary className="flex cursor-pointer items-center gap-2">
								<span className="h-4 w-4 rounded border border-border" style={{ background: c.value }} />
								<span className="flex-1 font-mono">{c.name}</span>
							</summary>
							<div className="mt-2 grid gap-2">
								<Input
									label="Name"
									value={c.name}
									onChange={(e) => edit((f) => void (f.colors[i]!.name = e.target.value), `c${i}:name`)}
									className="h-8 font-mono text-xs"
								/>
								<div className="flex items-end gap-1">
									<Input
										label="Value"
										value={c.value}
										onChange={(e) => edit((f) => void (f.colors[i]!.value = e.target.value), `c${i}:value`)}
										className="h-8 text-xs"
									/>
									<input
										type="color"
										aria-label={`${c.name} picker`}
										value={/^#[0-9a-f]{6}$/i.test(c.value) ? c.value : "#000000"}
										onChange={(e) => edit((f) => void (f.colors[i]!.value = e.target.value), `c${i}:value`)}
										className="mb-0.5 h-8 w-8 shrink-0 rounded border border-border"
									/>
								</div>
								<Input
									label="Dark mode value"
									value={c.dark ?? ""}
									placeholder="same"
									onChange={(e) => edit((f) => void (f.colors[i]!.dark = e.target.value || undefined), `c${i}:dark`)}
									className="h-8 text-xs"
								/>
								<div className="grid grid-cols-2 gap-2">
									<Input
										label="Shades"
										type="number"
										min={0}
										max={9}
										value={c.shades}
										onChange={(e) => edit((f) => void (f.colors[i]!.shades = num(e.target.value, 0)), `c${i}:shades`)}
										className="h-8 text-xs"
									/>
									<Input
										label="Tints"
										type="number"
										min={0}
										max={9}
										value={c.tints}
										onChange={(e) => edit((f) => void (f.colors[i]!.tints = num(e.target.value, 0)), `c${i}:tints`)}
										className="h-8 text-xs"
									/>
								</div>
								<Switch
									label="Transparent steps (-10 … -90)"
									checked={c.transparent}
									onChange={(e) => edit((f) => void (f.colors[i]!.transparent = e.target.checked), `c${i}:t`)}
								/>
								<Switch
									label="Utility classes"
									checked={c.utilities}
									onChange={(e) => edit((f) => void (f.colors[i]!.utilities = e.target.checked), `c${i}:u`)}
								/>
								<div className="flex gap-0.5">
									{Array.from({ length: c.shades }, (_, s) => (
										<span
											key={`d${s}`}
											className="h-4 flex-1 rounded-sm"
											style={{
												background: `color-mix(in oklab, ${c.value}, black ${Math.round((80 * (c.shades - s)) / (c.shades + 1))}%)`,
											}}
										/>
									))}
									<span className="h-4 flex-1 rounded-sm ring-1 ring-foreground" style={{ background: c.value }} />
									{Array.from({ length: c.tints }, (_, t) => (
										<span
											key={`l${t}`}
											className="h-4 flex-1 rounded-sm"
											style={{
												background: `color-mix(in oklab, ${c.value}, white ${Math.round((80 * (t + 1)) / (c.tints + 1))}%)`,
											}}
										/>
									))}
								</div>
								<Button size="sm" variant="ghost" onClick={() => edit((f) => void f.colors.splice(i, 1), `c${i}:del`)}>
									<Trash2 size={12} /> Remove color
								</Button>
							</div>
						</details>
					))}
				</Section>
			)}
			{(tab === "type" || tab === "space") && (
				<ScaleEditor name={tab} scale={tab === "type" ? fw.type : fw.space} fw={fw} />
			)}
			{tab === "type" && (
				<Section
					title="Fonts"
					action={
						<IconButton
							label="Add font"
							size="icon-sm"
							onClick={() =>
								edit(
									(f) => void f.fonts.push({ name: `font-${f.fonts.length + 1}`, stack: "system-ui, sans-serif" }),
									"add-font",
								)
							}
						>
							<Plus size={14} />
						</IconButton>
					}
				>
					{fw.fonts.map((font, i) => (
						<div key={i} className="grid gap-1 rounded border border-border p-2">
							<Input
								label="Name"
								value={font.name}
								onChange={(e) => edit((f) => void (f.fonts[i]!.name = e.target.value), `f${i}:name`)}
								className="h-8 font-mono text-xs"
							/>
							<Input
								label="Font stack"
								value={font.stack}
								placeholder="'Inter', sans-serif"
								onChange={(e) => edit((f) => void (f.fonts[i]!.stack = e.target.value), `f${i}:stack`)}
								className="h-8 text-xs"
							/>
							<Input
								label="Stylesheet (https, optional)"
								value={font.href ?? ""}
								placeholder="https://fonts.bunny.net/css?family=inter:400,700"
								onChange={(e) => edit((f) => void (f.fonts[i]!.href = e.target.value || undefined), `f${i}:href`)}
								className="h-8 text-xs"
							/>
							<Button size="sm" variant="ghost" onClick={() => edit((f) => void f.fonts.splice(i, 1), `f${i}:del`)}>
								<Trash2 size={12} /> Remove font
							</Button>
						</div>
					))}
				</Section>
			)}
		</div>
	);
}

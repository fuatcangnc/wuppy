/**
 * Text a theme renders from code (`<h2>{title}</h2>` with `title="…"` at the call site, or `{item.title}` from a data
 * array) can still be edited when the old text is written exactly once in the theme's source as a string: that string
 * is the one to change.
 */
const CODE = /^src\/.*\.(astro|[jt]sx|[cm]?[jt]s)$/;

export interface TextSpot {
	path: string;
	start: number;
	end: number;
	text: string;
}

/** The single place `from` is written as a quoted string in the theme's code, the number of places otherwise. */
export function findTextSource(
	files: Array<{ path: string; content: string }>,
	from: string,
	value: string,
): TextSpot | number {
	if (!from.trim()) return 0;
	const spots: Array<Omit<TextSpot, "text"> & { quote: string; attr: boolean }> = [];
	for (const { path, content } of files) {
		if (!CODE.test(path)) continue;
		for (const quote of ['"', "'"]) {
			const needle = quote + from + quote;
			for (let at = content.indexOf(needle); at !== -1; at = content.indexOf(needle, at + 1)) {
				// An attribute value (`title="…"`) has no escapes; a JS string does.
				const attr = /(^|[^=!<>])=\s*$/.test(content.slice(Math.max(0, at - 20), at));
				spots.push({ path, start: at, end: at + needle.length, quote, attr });
			}
		}
	}
	if (spots.length !== 1) return spots.length;
	const spot = spots[0]!;
	let text: string;
	if (!spot.attr) text = JSON.stringify(value);
	else if (!value.includes('"')) text = `"${value}"`;
	else if (!value.includes("'")) text = `'${value}'`;
	else throw new Error("This text has both quote marks; edit it in Code view");
	return { path: spot.path, start: spot.start, end: spot.end, text };
}

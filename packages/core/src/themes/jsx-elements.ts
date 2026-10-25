import { importInstalled } from "./installed-dep.ts";

import type ts from "typescript";

const { default: typescript } = await importInstalled<{ default: typeof ts }>("typescript");

/**
 * The elements of a React (`.tsx`/`.jsx`) file in the same shape astro-edit.ts reads from Astro's parser, so one
 * editor serves both. Spans are offsets in the source; `siblings` is null for an element made inside an expression.
 */
interface Span {
	start: number;
	end: number;
}
interface JsxEl extends Span {
	type: "JSXElement";
	openingElement: Span & { name: Span & { name: string }; attributes: Array<Span & Record<string, unknown>> };
	closingElement: (Span & { name: Span }) | null;
	children: Array<Span & { type: string }>;
}

export function jsxElements(source: string, file = "x.tsx"): Array<{ el: JsxEl; siblings: JsxEl[] | null }> {
	const sf = typescript.createSourceFile(
		file,
		source,
		typescript.ScriptTarget.Latest,
		false,
		typescript.ScriptKind.TSX,
	);
	const span = (n: ts.Node): Span => ({ start: n.getStart(sf), end: n.end });
	const out: Array<{ el: JsxEl; siblings: JsxEl[] | null }> = [];

	const attr = (a: ts.JsxAttributeLike) =>
		typescript.isJsxAttribute(a)
			? {
					...span(a),
					type: "JSXAttribute",
					name: { ...span(a.name), name: a.name.getText(sf) },
					value: a.initializer
						? {
								...span(a.initializer),
								type: typescript.isStringLiteral(a.initializer) ? "Literal" : "JSXExpressionContainer",
							}
						: null,
				}
			: { ...span(a), type: "JSXSpreadAttribute" };
	const child = (c: ts.JsxChild): Span & { type: string } =>
		typescript.isJsxText(c)
			? { start: c.pos, end: c.end, type: "JSXText" }
			: { ...span(c), type: typescript.isJsxExpression(c) ? "JSXExpressionContainer" : "JSXElement" };

	const element = (n: ts.JsxElement | ts.JsxSelfClosingElement): JsxEl => {
		const open = typescript.isJsxElement(n) ? n.openingElement : n;
		const el: JsxEl = {
			type: "JSXElement",
			...span(n),
			openingElement: {
				...span(open),
				name: { ...span(open.tagName), name: open.tagName.getText(sf) },
				attributes: open.attributes.properties.map(attr),
			},
			closingElement: typescript.isJsxElement(n)
				? { ...span(n.closingElement), name: span(n.closingElement.tagName) }
				: null,
			// Whitespace-only text between tags is not a child, as in Astro's tree.
			children: typescript.isJsxElement(n)
				? n.children.filter((c) => !(typescript.isJsxText(c) && c.containsOnlyTriviaWhiteSpaces)).map(child)
				: [],
		};
		return el;
	};

	const walk = (node: ts.Node, siblings: JsxEl[] | null): void => {
		if (typescript.isJsxElement(node) || typescript.isJsxSelfClosingElement(node)) {
			const el = element(node);
			siblings?.push(el);
			out.push({ el, siblings });
			if (typescript.isJsxElement(node)) {
				const list: JsxEl[] = [];
				for (const c of node.children) walk(c, typescript.isJsxExpression(c) ? null : list);
				typescript.forEachChild(node.openingElement, (c) => walk(c, null));
			} else typescript.forEachChild(node, (c) => walk(c, null));
			return;
		}
		if (typescript.isJsxFragment(node)) {
			const list: JsxEl[] = [];
			for (const c of node.children) walk(c, typescript.isJsxExpression(c) ? null : list);
			return;
		}
		typescript.forEachChild(node, (c) => walk(c, null));
	};
	walk(sf, null);
	return out;
}

// Copies the built starter into a temp dir (fresh content + empty auth DB) and serves it.
import { spawn } from "node:child_process";
import { cpSync, createWriteStream, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const src = resolve(import.meta.dirname, "../../templates/starter");
const dir = mkdtempSync(join(tmpdir(), "wuppy-e2e-"));
cpSync(src, dir, {
	recursive: true,
	filter: (p) => {
		const rel = p.slice(src.length);
		// The empty temp site must not inherit local runtime uploads from the starter.
		return !/(^|\/)(node_modules|\.wuppy|\.git)(\/|$)/.test(rel) && !/^\/public\/uploads(\/|$)/.test(rel);
	},
});
symlinkSync(join(src, "node_modules"), join(dir, "node_modules"));

const dev = process.argv[2] === "dev";
const port = process.env.PORT ?? (dev ? "4555" : "4444");
// Playwright cannot read the webServer's inherited stdout, so mirror it to a
// per-port file. E2E tests use this to follow console-delivered email links.
const logPath = join(tmpdir(), `wuppy-e2e-${port}.log`);
writeFileSync(logPath, "");
const log = createWriteStream(logPath, { flags: "a" });
// `dev` runs the real `astro dev` (workspace sources through Vite); otherwise the built server.
const [cmd, args] = dev
	? ["node", ["node_modules/astro/bin/astro.mjs", "dev", "--host", "127.0.0.1", "--port", port, "--ignore-lock"]]
	: ["node", ["dist/server/entry.mjs"]];
const child = spawn(cmd, args, {
	cwd: dir,
	stdio: ["ignore", "pipe", "pipe"],
	env: {
		...process.env,
		HOST: "127.0.0.1",
		PORT: port,
		WUPPY_URL: `http://127.0.0.1:${port}`,
		WUPPY_SECRET: "e2e-secret-e2e-secret-e2e-secret-123",
		// Simulate a loopback reverse proxy so a test can present a distinct
		// forwarded client IP without weakening the production default.
		WUPPY_TRUSTED_PROXIES: "127.0.0.1,::1",
	},
});
child.stdout.on("data", (chunk) => {
	process.stdout.write(chunk);
	log.write(chunk);
});
child.stderr.on("data", (chunk) => {
	process.stderr.write(chunk);
	log.write(chunk);
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill());
child.on("exit", (code) => {
	log.end();
	process.exit(code ?? 0);
});

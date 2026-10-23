#!/usr/bin/env node
// Dev only: fills the Sites page with sample connected sites and client members.
// Usage: node scripts/seed-sites.mjs [site root, default templates/starter] [--remove]
// Sample rows have ids starting with "seed-". Their tokens are not real, so "Check" and
// switching to them answer "reconnect required" until a real hub token is set with "Replace token".
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const args = process.argv.slice(2);
const remove = args.includes("--remove");
const root = resolve(args.find((a) => !a.startsWith("--")) ?? "templates/starter");
const file = resolve(root, ".wuppy/auth.db");
if (!existsSync(file)) {
	console.error(`No database at ${file}. Start the site once first.`);
	process.exit(1);
}
const db = new DatabaseSync(file);
if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'wuppy_sites'").get()) {
	console.error("The sites tables do not exist yet. Open /admin/sites once, then run this again.");
	process.exit(1);
}

db.exec("BEGIN");
db.exec("DELETE FROM wuppy_site_members WHERE site_id LIKE 'seed-%' OR user_id LIKE 'seed-%'");
db.exec("DELETE FROM wuppy_site_invites WHERE site_id LIKE 'seed-%'");
db.exec("DELETE FROM wuppy_sites WHERE id LIKE 'seed-%'");
db.exec("DELETE FROM user WHERE id LIKE 'seed-%'");
if (remove) {
	db.exec("COMMIT");
	console.log("Sample sites removed.");
	process.exit(0);
}

const owner = db.prepare("SELECT id FROM user WHERE role = 'admin' ORDER BY createdAt LIMIT 1").get();
if (!owner) {
	db.exec("ROLLBACK");
	console.error("Create the owner account first.");
	process.exit(1);
}

const day = 86_400_000;
const at = (days) => new Date(Date.now() + days * day).toISOString();
const EDITOR = ["content:read", "content:write", "content:publish", "media:write", "site:settings", "audit:read"];

const sites = [
	["seed-acme", "Acme Coffee", "https://acmecoffee.example", "connected", EDITOR, 320, -0.1, null, -60],
	["seed-nova", "Nova Studio", "https://novastudio.example", "connected", EDITOR.slice(0, 4), 41, -0.5, null, -45],
	[
		"seed-lumen",
		"Lumen Dental",
		"https://lumendental.example",
		"connection_error",
		EDITOR,
		12,
		-1,
		"The site did not answer",
		-30,
	],
	[
		"seed-orbit",
		"Orbit Travel Blog",
		"https://orbit-travel.example",
		"connected",
		["content:read", "content:write"],
		200,
		-2,
		null,
		-21,
	],
	[
		"seed-pine",
		"Pine & Co. Architects",
		"https://pineandco.example",
		"connection_error",
		EDITOR,
		-3,
		-3,
		"The site rejected the token (revoked or expired)",
		-14,
	],
	["seed-harbor", "Harbor Books", "https://harborbooks.example", "unchecked", EDITOR, 90, null, null, -2],
	["seed-mosaic", "Mosaic Agency", "https://mosaic-agency.example", "connected", EDITOR, 365, -0.02, null, -1],
];
const addSite = db.prepare(
	"INSERT INTO wuppy_sites (id, name, url, token_enc, token_last4, status, permissions, token_expires_at, last_checked_at, last_error, created_by, created_at) VALUES (?, ?, ?, 'seed', ?, ?, ?, ?, ?, ?, ?, ?)",
);
for (const [id, name, url, status, permissions, expires, checked, error, created] of sites)
	addSite.run(
		id,
		name,
		url,
		id.slice(5, 9).padEnd(4, "x"),
		status,
		JSON.stringify(permissions),
		at(expires),
		checked === null ? null : at(checked),
		error,
		owner.id,
		at(created),
	);

const people = [
	["seed-ayse", "Ayşe Yılmaz", "ayse@acmecoffee.example"],
	["seed-mert", "Mert Kaya", "mert@novastudio.example"],
	["seed-elif", "Elif Demir", "elif@lumendental.example"],
	["seed-can", "Can Öztürk", "can@orbit-travel.example"],
	["seed-zeynep", "Zeynep Arslan", "zeynep@mosaic-agency.example"],
];
const addUser = db.prepare(
	"INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role, banned) VALUES (?, ?, ?, 1, ?, ?, 'client', 0)",
);
for (const [id, name, email] of people) addUser.run(id, name, email, at(-10), at(-10));

const addMember = db.prepare("INSERT INTO wuppy_site_members (site_id, user_id, role) VALUES (?, ?, ?)");
for (const [site, user, role] of [
	["seed-acme", "seed-ayse", "editor"],
	["seed-acme", "seed-mert", "viewer"],
	["seed-nova", "seed-mert", "author"],
	["seed-lumen", "seed-elif", "editor"],
	["seed-orbit", "seed-can", "author"],
	["seed-mosaic", "seed-zeynep", "editor"],
	["seed-mosaic", owner.id, "admin"],
])
	addMember.run(site, user, role);
db.exec("COMMIT");
console.log(`Added ${sites.length} sample sites and ${people.length} client members to ${file}`);

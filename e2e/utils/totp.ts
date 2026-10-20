import { createHmac } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Buffer {
	let bits = "";
	for (const ch of input.replace(/=+$/, "").toUpperCase()) bits += ALPHABET.indexOf(ch).toString(2).padStart(5, "0");
	const bytes: number[] = [];
	for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
	return Buffer.from(bytes);
}

/** RFC 6238: HMAC-SHA1, 30 s step, 6 digits — what every authenticator app computes. */
export function totp(base32Secret: string, at = Date.now()): string {
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
	const hmac = createHmac("sha1", base32Decode(base32Secret)).update(counter).digest();
	const offset = hmac[hmac.length - 1]! & 0xf;
	const bin = hmac.readUInt32BE(offset) & 0x7fffffff;
	return String(bin % 1_000_000).padStart(6, "0");
}

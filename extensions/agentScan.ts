/**
 * Discover commands, skills, and agents.
 * Order: profiles/<life>/agents/ (YAML), shared profiles/agents/, cwd .pi/,
 * then .claude/.gemini/.codex (cwd, then $HOME). First-wins on name collision.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const LIVES = ["rust", "elixir", "ruby", "python"] as const;
const PROVIDERS = ["claude", "gemini", "codex"] as const;

export type Discovered = { name: string; description: string; content: string };
export type AgentDef = {
	name: string;
	description: string;
	tools: string[];
	body: string;
	source: string;
};
export type SourceGroup = {
	source: string;
	commands: Discovered[];
	skills: Discovered[];
	agents: AgentDef[];
};

export function canonicalLife(raw: string | undefined): string | undefined {
	if (!raw) return undefined;
	const k = raw.toLowerCase();
	if (k === "phoenix") return "elixir";
	if (k === "rails") return "ruby";
	if ((LIVES as readonly string[]).includes(k)) return k;
	return undefined;
}

function harnessRoot(extFileUrl: string): string {
	return process.env.MY_PI_AGENT_HOME || join(dirname(fileURLToPath(extFileUrl)), "..");
}

function parseFrontmatter(raw: string): { fields: Record<string, string>; body: string } {
	const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
	if (!match) return { fields: {}, body: raw };
	const fields: Record<string, string> = {};
	for (const line of match[1].split("\n")) {
		const idx = line.indexOf(":");
		if (idx > 0) {
			const val = line.slice(idx + 1).trim();
			const quoted = val.length > 1 && ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")));
			fields[line.slice(0, idx).trim()] = quoted ? val.slice(1, -1) : val;
		}
	}
	return { fields, body: match[2] };
}

function toolsOf(v: unknown): string[] {
	if (Array.isArray(v)) return v.filter((t) => typeof t === "string").map((t) => t.trim()).filter(Boolean);
	if (typeof v === "string") return v.split(",").map((t) => t.trim()).filter(Boolean);
	return [];
}

function firstLine(s: string): string {
	return s.split("\n").find((l) => l.trim())?.trim() || "";
}

function scanCommands(dir: string): Discovered[] {
	if (!existsSync(dir)) return [];
	const items: Discovered[] = [];
	try {
		for (const file of readdirSync(dir)) {
			if (!file.endsWith(".md")) continue;
			const raw = readFileSync(join(dir, file), "utf-8");
			const { fields, body } = parseFrontmatter(raw);
			items.push({
				name: basename(file, ".md"),
				description: fields.description || firstLine(body),
				content: body,
			});
		}
	} catch {}
	return items;
}

function scanSkills(dir: string): Discovered[] {
	if (!existsSync(dir)) return [];
	const items: Discovered[] = [];
	try {
		for (const entry of readdirSync(dir)) {
			const skillFile = join(dir, entry, "SKILL.md");
			const flatFile = join(dir, entry);
			if (existsSync(skillFile) && statSync(skillFile).isFile()) {
				const raw = readFileSync(skillFile, "utf-8");
				const { fields, body } = parseFrontmatter(raw);
				items.push({
					name: entry,
					description: fields.description || firstLine(body),
					content: raw,
				});
			} else if (entry.endsWith(".md") && statSync(flatFile).isFile()) {
				const raw = readFileSync(flatFile, "utf-8");
				const { fields, body } = parseFrontmatter(raw);
				items.push({
					name: basename(entry, ".md"),
					description: fields.description || firstLine(body),
					content: raw,
				});
			}
		}
	} catch {}
	return items;
}

function agentFromMd(path: string, source: string): AgentDef | null {
	try {
		const raw = readFileSync(path, "utf-8");
		const { fields, body } = parseFrontmatter(raw);
		return {
			name: fields.name || basename(path, ".md"),
			description: fields.description || "",
			tools: toolsOf(fields.tools),
			body: body.trim(),
			source,
		};
	} catch {
		return null;
	}
}

function agentFromYaml(path: string, source: string): AgentDef | null {
	try {
		const doc = parse(readFileSync(path, "utf-8"));
		if (doc == null || typeof doc !== "object" || Array.isArray(doc)) return null;
		const rec = doc as Record<string, unknown>;
		const fileName = basename(path).replace(/\.ya?ml$/, "");
		const name = typeof rec.name === "string" && rec.name ? rec.name : fileName;
		const description = typeof rec.description === "string" ? rec.description : "";
		const body = typeof rec.body === "string" ? rec.body : typeof rec.prompt === "string" ? rec.prompt : "";
		const hasContent = [rec.name, rec.description, rec.body, rec.prompt].some((v) => typeof v === "string" && v.trim());
		if (!hasContent) return null;
		return { name, description, tools: toolsOf(rec.tools), body: body.trim(), source };
	} catch {
		return null;
	}
}

function scanAgents(dir: string, source: string): AgentDef[] {
	if (!existsSync(dir)) return [];
	const items: AgentDef[] = [];
	try {
		for (const file of readdirSync(dir)) {
			const path = join(dir, file);
			if (!statSync(path).isFile()) continue;
			const agent = file.endsWith(".yaml") || file.endsWith(".yml")
				? agentFromYaml(path, source)
				: file.endsWith(".md")
					? agentFromMd(path, source)
					: null;
			if (agent) items.push(agent);
		}
	} catch {}
	return items;
}

function take<T extends { name: string }>(items: T[], seen: Set<string>, key = (n: string) => n): T[] {
	const out: T[] = [];
	for (const item of items) {
		const k = key(item.name);
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(item);
	}
	return out;
}

export function discover(cwd: string, extFileUrl: string, home = homedir()): SourceGroup[] {
	const root = harnessRoot(extFileUrl);
	const rawLife = process.env.PI_LIFE;
	const life = rawLife ? canonicalLife(rawLife) : undefined;
	if (rawLife && !life) return []; // invalid PI_LIFE fails closed, not broad
	const lives = life ? [life] : [...LIVES];
	const specs: { source: string; commands?: string; skills?: string; agents: string }[] = [
		...lives.map((l) => ({
			source: `profiles/${l}/agents`,
			agents: join(root, "profiles", l, "agents"),
		})),
		{ source: "profiles/agents", agents: join(root, "profiles", "agents") },
	];
	specs.push({
		source: ".pi/agents",
		commands: join(cwd, ".pi", "commands"),
		skills: join(cwd, ".pi", "skills"),
		agents: join(cwd, ".pi", "agents"),
	});
	for (const p of PROVIDERS) {
		const dir = join(cwd, `.${p}`);
		specs.push({
			source: `.${p}`,
			commands: join(dir, "commands"),
			skills: join(dir, "skills"),
			agents: join(dir, "agents"),
		});
	}
	for (const p of PROVIDERS) {
		const dir = join(home, `.${p}`);
		specs.push({
			source: `~/.${p}`,
			commands: join(dir, "commands"),
			skills: join(dir, "skills"),
			agents: join(dir, "agents"),
		});
	}

	const seenCmd = new Set<string>();
	const seenSkill = new Set<string>();
	const seenAgent = new Set<string>();
	const groups: SourceGroup[] = [];
	for (const spec of specs) {
		const commands = spec.commands ? take(scanCommands(spec.commands), seenCmd) : [];
		const skills = spec.skills ? take(scanSkills(spec.skills), seenSkill) : [];
		const agents = take(scanAgents(spec.agents, spec.source), seenAgent, (n) => n.toLowerCase());
		if (commands.length || skills.length || agents.length) {
			groups.push({ source: spec.source, commands, skills, agents });
		}
	}
	return groups;
}

export function collectAgents(cwd: string, extFileUrl: string, home = homedir()): AgentDef[] {
	return discover(cwd, extFileUrl, home).flatMap((g) => g.agents);
}

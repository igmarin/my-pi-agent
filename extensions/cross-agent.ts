/**
 * Cross-Agent — register commands/skills from other coding agents.
 *
 * /name from commands/*.md, /skill:name from skills/. Agents listed only.
 * Search: harness profiles/<life>/agents/, cwd .pi/, then .claude/.gemini/.codex.
 *
 * Usage: pi -e extensions/cross-agent.ts
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { applyExtensionDefaults } from "./themeMap.ts";
import { discover } from "./agentScan.ts";

function expandArgs(template: string, args: string): string {
	const parts = args.split(/\s+/).filter(Boolean);
	let result = template.replace(/\$ARGUMENTS|\$@/g, args);
	for (let i = 0; i < parts.length; i++) result = result.replaceAll(`$${i + 1}`, parts[i]);
	return result;
}

export default function (pi: ExtensionAPI) {
	const groups = discover(process.cwd(), import.meta.url);
	for (const g of groups) {
		for (const cmd of g.commands) {
			pi.registerCommand(cmd.name, {
				description: `[${g.source}] ${cmd.description}`.slice(0, 120),
				handler: async (args) => {
					pi.sendUserMessage(expandArgs(cmd.content, args || ""));
				},
			});
		}
		for (const skill of g.skills) {
			pi.registerCommand(`skill:${skill.name}`, {
				description: `[${g.source}] ${skill.description}`.slice(0, 120),
				handler: async (args) => {
					const task = args?.trim();
					pi.sendUserMessage(task ? `${skill.content}\n\nTask: ${task}` : skill.content);
				},
			});
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
		if (!ctx.hasUI || groups.length === 0) return;
		const lines = groups.map((g) => {
			const bits = [
				g.commands.length ? `${g.commands.length} cmd` : "",
				g.skills.length ? `${g.skills.length} skill` : "",
				g.agents.length ? `${g.agents.length} agent` : "",
			].filter(Boolean);
			const names = [
				...g.commands.map((c) => `/${c.name}`),
				...g.skills.map((s) => `/skill:${s.name}`),
				...g.agents.map((a) => `@${a.name}`),
			].join(", ");
			return `${g.source} (${bits.join(", ")}): ${names}`;
		});
		setTimeout(() => ctx.ui.notify(lines.join("\n"), "info"), 100);
	});
}

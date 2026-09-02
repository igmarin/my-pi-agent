/**
 * Purpose Gate — Forces the engineer to declare intent before working
 *
 * On session start, asks "What is the purpose of this agent?"
 * A persistent widget shows the purpose for the rest of the session.
 * Blocks all prompts until answered. Empty/cancel re-prompts.
 * Ctrl-C is the only way to quit without a purpose.
 *
 * Usage: pi -e extensions/purpose-gate.ts
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import { applyExtensionDefaults } from "./themeMap.ts";

export default function (pi: ExtensionAPI) {
	let purpose: string | undefined;

	async function askForPurpose(ctx: ExtensionContext) {
		if (!ctx.hasUI) return;
		while (!purpose) {
			const answer = await ctx.ui.input(
				"What is the purpose of this agent?",
				"e.g. Refactor the auth module to use JWT"
			);

			if (answer && answer.trim()) {
				purpose = answer.trim();
			} else {
				ctx.ui.notify("Purpose is required. Ctrl-C to quit.", "warning");
			}
		}

		ctx.ui.setWidget("purpose", (_tui: unknown, theme: { fg: (k: string, s: string) => string; bold: (s: string) => string }) => {
			return {
				render(width: number): string[] {
					const pad = " ".repeat(width);
					const label = theme.fg("accent", theme.bold("  PURPOSE: "));
					const msg = theme.fg("text", theme.bold(purpose!));
					const content = truncateToWidth(label + msg + " ".repeat(width), width, "");
					return [pad, content, pad];
				},
				invalidate() {},
			};
		});
	}

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
		if (!ctx.hasUI) return;
		void askForPurpose(ctx);
	});

	pi.on("before_agent_start", async (event) => {
		if (!purpose) return;
		return {
			systemPrompt: event.systemPrompt + `\n\n<purpose>\nYour singular purpose this session: ${purpose}\nStay focused on this goal. If a request drifts from this purpose, gently remind the user.\n</purpose>`,
		};
	});

	pi.on("input", async (_event, ctx) => {
		if (!ctx.hasUI) return { action: "continue" as const };
		if (!purpose) {
			ctx.ui.notify("Set a purpose first.", "warning");
			return { action: "handled" as const };
		}
		return { action: "continue" as const };
	});
}

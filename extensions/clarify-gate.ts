/**
 * Clarify Gate — block write/edit until the user runs /clarify.
 *
 * Solo mode: after purpose-gate, the user is encouraged to land a self-
 * contained prompt (the `clarify` + `requirements-clarifier` mantra skills
 * drive this conversationally). The gate is the hard stop: write/edit tool
 * calls are blocked with feedback until the user runs /clarify. Read-only
 * tools (read, grep, find, ls, glob, and bash read-only commands covered by
 * damage-control) are allowed during clarify so the model can gather context.
 *
 * Per-session: /clarify opens the gate and it stays open. Print/JSON mode
 * (no UI) skips the gate; the rule does not apply when there is no user
 * input box to type /clarify into.
 *
 * Usage: pi -e extensions/clarify-gate.ts
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { applyExtensionDefaults } from "./themeMap.ts";

const REASON = "Clarify gate: write/edit is blocked until you run /clarify to accept the prompt. Read-only tools (read, grep, find, ls, glob, bash read) are allowed.";

export default function (pi: ExtensionAPI) {
	let accepted = false;

	function notifyGateState(ctx: ExtensionContext) {
		if (!ctx.hasUI) return;
		if (accepted) {
			ctx.ui.notify("Clarify gate: open (write/edit enabled).", "info");
		} else {
			ctx.ui.notify("Clarify gate: closed. Write/edit blocked until you run /clarify.", "info");
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
		notifyGateState(ctx);
	});

	pi.registerCommand("clarify", {
		description: "Accept the current prompt and enable write/edit. Run after the model has the prompt you want.",
		handler: async (_args, ctx) => {
			accepted = true;
			if (ctx.hasUI) ctx.ui.notify("Clarify gate: open. Write/edit enabled for this session.", "info");
		},
	});

	pi.on("tool_call", async (event) => {
		if (accepted) return;
		if (isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
			return { block: true, reason: REASON };
		}
	});
}

export const __test__ = { REASON };

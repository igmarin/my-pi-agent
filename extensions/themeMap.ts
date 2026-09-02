/**
 * Per-extension theme + terminal title. First -e wins when stacked.
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const THEME_MAP: Record<string, string> = {
	minimal: "synthwave",
	"purpose-gate": "tokyo-night",
	"cross-agent": "ocean-breeze",
	"system-select": "catppuccin-mocha",
};

function extensionName(fileUrl: string): string {
	const filePath = fileUrl.startsWith("file://") ? fileURLToPath(fileUrl) : fileUrl;
	return basename(filePath).replace(/\.[^.]+$/, "");
}

function primaryExtensionName(): string | null {
	const argv = process.argv;
	for (let i = 0; i < argv.length - 1; i++) {
		if (argv[i] === "-e" || argv[i] === "--extension") {
			return basename(argv[i + 1]).replace(/\.[^.]+$/, "");
		}
	}
	return null;
}

export function applyExtensionDefaults(fileUrl: string, ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;

	const name = extensionName(fileUrl);
	const primary = primaryExtensionName();
	if (!primary || primary === name) {
		const themeName = THEME_MAP[name] ?? "synthwave";
		const result = ctx.ui.setTheme(themeName);
		if (!result.success && themeName !== "synthwave") ctx.ui.setTheme("synthwave");
	}

	if (primary) {
		// ponytail: 150ms beats Pi's startup title; drop if Pi grows a title hook
		setTimeout(() => ctx.ui.setTitle(`π - ${primary}`), 150);
	}
}

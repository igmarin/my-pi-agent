/**
 * Expand $ARGUMENTS / $@ / $1..$9 in a command template. Used by cross-agent
 * to substitute args when registering discovered slash commands.
 */
export function expandArgs(template: string, args: string): string {
	const parts = args.split(/\s+/).filter(Boolean);
	return template.replace(/\$(ARGUMENTS|@|\d+)/g, (m, key: string) => {
		if (key === "ARGUMENTS" || key === "@") return args;
		return parts[Number(key) - 1] ?? "";
	});
}

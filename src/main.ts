export function getUsageText(): string {
  return `Usage: codex-sidecar <command>

Commands:
  start    Start sidecar session and create a Codex thread
  ask      Send a message to the active Codex thread
  reset    Reset the active Codex thread
  stop     Stop the active Codex sidecar`;
}

export async function runCli(argv: readonly string[]): Promise<void> {
  const [command = "help"] = argv;

  switch (command) {
    case "start":
    case "ask":
    case "reset":
    case "stop":
      console.error(`Not implemented yet: ${command}`);
      process.exitCode = 1;
      return;

    default:
      console.log(getUsageText());
  }
}

export function parseDebugCommand(command: string): boolean | undefined {
  const match = /^debug\s*=\s*(true|false)$/i.exec(command.trim());
  return match ? match[1].toLowerCase() === "true" : undefined;
}

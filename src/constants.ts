/** Global identifiers and small constants shared across the extension. */

export const EXTENSION_ID = 'het-fti.het-devtools';
export const EXTENSION_NAME = 'HeT DevTools';

/** Output channel (full logs for long-running tasks). */
export const LOG_CHANNEL_NAME = 'HeT DevTools';

/** Command ids contributed by package.json. */
export const COMMANDS = {
  hello: 'het.hello',
} as const;

/** Global state keys (extension globalState / workspaceState). */
export const STATE = {
  welcomeSeen: 'het.welcomeSeen',
  lastBuildResult: 'het.lastBuildResult',
  lastHealthCheck: 'het.lastHealthCheck',
} as const;

/** Output channel instance (lazy). */
let channel: import('vscode').OutputChannel | undefined;

export function setOutputChannel(c: import('vscode').OutputChannel): void {
  channel = c;
}

/** Timestamped log line to the HeT output channel. */
export function log(message: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  channel?.appendLine(`[${ts}] ${message}`);
}

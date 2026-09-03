import { isAbsolute, join } from 'node:path';
import * as vscode from 'vscode';
import { EXTENSION_ID, LOG_CHANNEL_NAME, log, setOutputChannel } from './constants';
import { locateConan, runConanCreate } from './core/conanService';
import { runHealthCheck } from './core/healthCheck';
import { parseCompilerOutput } from './core/outputParser';
import { detectProjectsIn } from './core/projectDetector';
import { detectToolchain } from './core/toolchainDetector';
import { showDashboardPanel } from './features/dashboard/panel';
import { DashboardSnapshot } from './features/ui';
import { showWelcomePanel } from './features/welcome/panel';
import { FcppProject, ParsedIssue } from './types';

let channel: vscode.OutputChannel | undefined;
let statusItem: vscode.StatusBarItem | undefined;
let currentProject: FcppProject | undefined;
let activationLine = '';
const buildDiagnostics = vscode.languages.createDiagnosticCollection('het-build');

/**
 * Read-only activation evidence (also written to the "HeT DevTools" output
 * channel). Exposed so the automated integration smoke test can assert the
 * exact activation line without manual F5 inspection.
 */
export function getActivationLine(): string {
  return activationLine;
}

/** Entry point: wires Phase 1 host features (detection, status bar, build). */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  channel = vscode.window.createOutputChannel(LOG_CHANNEL_NAME);
  setOutputChannel(channel);
  context.subscriptions.push(channel, buildDiagnostics);
  activationLine = `activated — ${EXTENSION_ID} v${context.extension.packageJSON.version}`;
  log(activationLine);

  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  context.subscriptions.push(statusItem);
  await refreshStatus();

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => void refreshStatus()),
    vscode.commands.registerCommand('het.hello', () => {
      void vscode.window.showInformationMessage('HeT DevTools smoke test passed ✔');
    }),
    vscode.commands.registerCommand('het.getActivationLine', () => activationLine),
    vscode.commands.registerCommand('het.getCurrentProject', () => currentProject?.metadata?.name ?? null),
    vscode.commands.registerCommand('het.refresh', () => refreshStatus()),
    vscode.commands.registerCommand('het.build', () => buildProject()),
    vscode.commands.registerCommand('het.welcome', () => openWelcome(context)),
    vscode.commands.registerCommand('het.dashboard', () => openDashboard(context)),
    vscode.commands.registerCommand('het.healthCheck', () => openDashboard(context)),
  );

  // First-run onboarding (never inside the automated extension test host).
  const isTestHost = process.argv.some((a) => a.includes('--extensionTestsPath'));
  if (!isTestHost && currentProject && !context.workspaceState.get<boolean>('het.welcomeSeen')) {
    openWelcome(context);
  }
}

/** Assemble the data snapshot shared by the dashboard / welcome panels. */
async function buildSnapshot(): Promise<DashboardSnapshot> {
  const tools = await detectToolchain();
  const health = await runHealthCheck({ project: currentProject, tools });
  return { project: currentProject, tools, health };
}

function runHostCommand(command: string): void {
  void vscode.commands.executeCommand(command);
}

function openWelcome(context: vscode.ExtensionContext): void {
  showWelcomePanel(context, {
    getSnapshot: buildSnapshot,
    runCommand: runHostCommand,
    onDismiss: () => void context.workspaceState.update('het.welcomeSeen', true),
  });
}

function openDashboard(context: vscode.ExtensionContext): void {
  showDashboardPanel(context, { getSnapshot: buildSnapshot, runCommand: runHostCommand });
}

/** Detect fcpp projects in the current window and update the status bar. */
async function refreshStatus(): Promise<void> {
  if (!statusItem) {
    return;
  }
  const roots = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  const projects = await detectProjectsIn(roots);
  currentProject = projects[0];

  if (currentProject?.metadata) {
    const m = currentProject.metadata;
    statusItem.text = `$(package) ${m.name} v${m.version ?? '0.0.0'} ${m.build_type ?? ''}`.replace(/\s+$/, '');
    statusItem.tooltip = `HeT DevTools — ${m.name} @ ${currentProject.root}（level: ${currentProject.level}）\n单击构建`;
    statusItem.command = 'het.build';
    statusItem.show();
    log(`project detected: ${m.name} (level=${currentProject.level}) @ ${currentProject.root}`);
  } else {
    currentProject = undefined;
    statusItem.text = 'HeT: 无 fcpp 项目';
    statusItem.tooltip = '当前工作区未检测到 fcpp 项目（需要 metadata.json）';
    statusItem.command = undefined;
    statusItem.show();
    log('no fcpp project in current workspace');
  }
}

/** Run `conan create` for the current project; map diagnostics to the Problems panel. */
async function buildProject(): Promise<void> {
  const project = currentProject;
  if (!project || !project.metadata) {
    void vscode.window.showWarningMessage('未检测到 fcpp 项目：请先打开含 metadata.json 的库文件夹。');
    return;
  }

  const conanExe = await locateConan();
  if (!conanExe) {
    void vscode.window.showErrorMessage(
      '找不到 conan。请先安装 Python + Conan（pip install conan; conan profile detect --force）。',
    );
    return;
  }

  buildDiagnostics.clear();
  log(`[build] ${conanExe} create . (Debug) in ${project.root}`);

  const summary = await runConanCreate(
    conanExe,
    project.root,
    { buildType: 'Debug' },
    {
      onStdout: (c) => channel?.append(c),
      onStderr: (c) => channel?.append(c),
      timeoutMs: 0,
    },
  );
  channel?.appendLine('');

  const issues = parseCompilerOutput(`${summary.stdout}\n${summary.stderr}`);
  mapIssues(issues, project.root);
  log(`[build] finished ok=${summary.ok} issues=${issues.length}`);

  if (summary.ok) {
    void vscode.window.showInformationMessage(`构建成功 — ${project.metadata.name} (Debug)`);
  } else {
    const detail = issues.length > 0 ? `${issues.length} 个错误/警告，详见“问题”面板` : '详见“输出 → HeT DevTools”';
    void vscode.window.showErrorMessage(`构建失败：${detail}`);
  }
}

/** Resolve relative compiler paths against the project root and publish diagnostics. */
function mapIssues(issues: ParsedIssue[], projectRoot: string): void {
  const byFile = new Map<string, vscode.Diagnostic[]>();
  for (const issue of issues) {
    const abs = isAbsolute(issue.file) ? issue.file : join(projectRoot, issue.file);
    const uri = vscode.Uri.file(abs);
    const range = new vscode.Range(
      new vscode.Position(Math.max(0, issue.line - 1), Math.max(0, (issue.column ?? 1) - 1)),
      new vscode.Position(Math.max(0, issue.line - 1), 1024),
    );
    const diagnostic = new vscode.Diagnostic(
      range,
      issue.message,
      issue.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.source = 'het-build';
    const list = byFile.get(uri.toString()) ?? [];
    list.push(diagnostic);
    byFile.set(uri.toString(), list);
  }
  for (const [uriKey, diagnosticsList] of byFile) {
    buildDiagnostics.set(vscode.Uri.parse(uriKey), diagnosticsList);
  }
}

export function deactivate(): void {
  log('deactivated');
}

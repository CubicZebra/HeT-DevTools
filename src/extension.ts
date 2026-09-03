import { isAbsolute, join } from 'node:path';
import * as vscode from 'vscode';
import { EXTENSION_ID, LOG_CHANNEL_NAME, log, setOutputChannel } from './constants';
import { locateConan, runConanCreate } from './core/conanService';
import { parseGTestOutput, GTestRunSummary } from './core/gtestRunner';
import { runHealthCheck } from './core/healthCheck';
import { parseCompilerOutput } from './core/outputParser';
import { detectProjectsIn } from './core/projectDetector';
import { detectToolchain } from './core/toolchainDetector';
import { showDashboardPanel } from './features/dashboard/panel';
import { showDepsPanel, DepAddInput } from './features/deps/panel';
import { ModulePanelInput, showModuleWizardPanel } from './features/moduleWizard/panel';
import { DiscoveredModule, showTestgenPanel } from './features/testgen/panel';
import { CoverageState, showCoveragePanel } from './features/coverage/panel';
import { showSettingsPanel } from './features/settings/panel';
import { showTestResultsPanel } from './features/testResults/panel';
import { DashboardSnapshot } from './features/ui';
import { registerTestController } from './features/testExplorer/controller';
import { showWelcomePanel } from './features/welcome/panel';
import {
  addDependency,
  listDependencies,
  removeDependency,
} from './core/dependencyService';
import { planModuleFiles } from './core/moduleTemplate';
import { planModuleTests, scanHeader } from './core/testgen';
import { applyMetadataPatch, loadMetadata } from './core/metadataService';
import { pathExists, readText, writeJson, writeText } from './utils/fs';
import { FcppMetadata, FcppProject, ParsedIssue } from './types';

let channel: vscode.OutputChannel | undefined;
let statusItem: vscode.StatusBarItem | undefined;
let currentProject: FcppProject | undefined;
let activationLine = '';
let lastTestSummary: GTestRunSummary | undefined;
let lastBuildOk: boolean | undefined;
let lastConanOutput = '';
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
  contextRef = context;

  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  context.subscriptions.push(statusItem);
  await refreshStatus();

  // Test Explorer: discover test_package/test/unit GTest cases, run via conan create.
  registerTestController(context, { projectRoot: () => currentProject?.root, run: executeTestRun });

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
    vscode.commands.registerCommand('het.test', () => runTests()),
    vscode.commands.registerCommand('het.showTestResults', () => showStoredTestResults(context)),
    vscode.commands.registerCommand('het.openSettings', () => openSettingsPanel(context)),
    vscode.commands.registerCommand('het.openDeps', () => openDepsPanel(context)),
    vscode.commands.registerCommand('het.addDependency', () => openDepsPanel(context)),
    vscode.commands.registerCommand('het.newModule', () => openModuleWizard(context)),
    vscode.commands.registerCommand('het.generateTests', () => openTestgenPanel(context)),
    vscode.commands.registerCommand('het.coverage', () => openCoveragePanel(context)),
    vscode.commands.registerCommand('het.healthCheck', () => openDashboard(context)),
    vscode.commands.registerCommand('het.getBuildOk', () => lastBuildOk ?? null),
    vscode.commands.registerCommand('het.getTestSummary', () =>
      lastTestSummary
        ? { passed: lastTestSummary.passed, failed: lastTestSummary.failed, skipped: lastTestSummary.skipped }
        : null,
    ),
    vscode.commands.registerCommand('het.getLastConanOutput', () => lastConanOutput.slice(-4000)),
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

/** Dependency manager (G-07): list + add/remove with preview & dual-file write. */
function openDepsPanel(context: vscode.ExtensionContext): void {
  const loadPair = async (): Promise<{ metadata: FcppMetadata; conandata: string }> => {
    const root = currentProject?.root;
    if (!root) {
      throw new Error('未检测到 fcpp 项目：请先打开含 metadata.json 的库文件夹。');
    }
    const metadata = await loadMetadata(root);
    let conandata: string;
    try {
      conandata = await readText(join(root, 'conandata.yml'));
    } catch {
      conandata = '# requirements (managed by HeT DevTools)\nrequirements:\n';
    }
    return { metadata, conandata };
  };

  const persistPair = async (metadata: FcppMetadata, conandata: string): Promise<void> => {
    const root = currentProject?.root;
    if (!root) {
      return;
    }
    await writeText(join(root, 'conandata.yml'), conandata);
    await writeJson(join(root, 'metadata.json'), metadata, { backup: true });
  };

  showDepsPanel(context, {
    getState: async () => {
      const { metadata, conandata } = await loadPair();
      return {
        views: listDependencies(metadata, conandata),
        issues: [],
      };
    },
    add: async (input: DepAddInput) => {
      const { metadata, conandata } = await loadPair();
      const targets = input.targets ? input.targets.split(',').map((t) => t.trim()).filter(Boolean) : undefined;
      const res = addDependency(metadata, conandata, {
        conanName: input.conanName,
        version: input.version,
        bucket: input.bucket,
        targets,
      });
      if (!res.ok || !res.nextMetadata || !res.nextConandataText) {
        return { ok: false, message: `添加失败：${res.issues.join('；')}` };
      }
      const choice = await vscode.window.showWarningMessage(
        `添加 ${input.conanName}@${input.version} 到 ${input.bucket} 桶？将写入 conandata.yml 与 metadata.json。`,
        { modal: true },
        '应用',
        '取消',
      );
      if (choice !== '应用') {
        return { ok: false, message: '已取消' };
      }
      await persistPair(res.nextMetadata, res.nextConandataText);
      await refreshStatus();
      return { ok: true, message: `已添加 ${input.conanName}@${input.version} → ${input.bucket}` };
    },
    remove: async (bucket, displayKey) => {
      const { metadata, conandata } = await loadPair();
      const res = removeDependency(metadata, conandata, { bucket: bucket as never, displayKey });
      if (!res.ok || !res.nextMetadata || !res.nextConandataText) {
        return { ok: false, message: `移除失败：${res.issues.join('；')}` };
      }
      const choice = await vscode.window.showWarningMessage(`移除依赖 ${displayKey}？将同时清理 conandata.yml 与 metadata.json。`, {
        modal: true,
      }, '应用', '取消');
      if (choice !== '应用') {
        return { ok: false, message: '已取消' };
      }
      await persistPair(res.nextMetadata, res.nextConandataText);
      await refreshStatus();
      return { ok: true, message: `已移除 ${displayKey}` };
    },
    refresh: async () => {
      await refreshStatus();
    },
  });
}

/** New-module wizard (G-08): live preview then create the paired skeleton. */
function openModuleWizard(context: vscode.ExtensionContext): void {
  const toPlanInput = (input: ModulePanelInput) => ({
    moduleName: input.moduleName,
    description: input.description,
    language: input.language,
    since: input.since,
    extraDeclarations: (input.extraDeclarations ?? '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0),
  });

  const plan = async (input: ModulePanelInput) => {
    const p = planModuleFiles(toPlanInput(input));
    const conflicts: string[] = [];
    if (p.ok && currentProject) {
      for (const f of p.files) {
        if (await pathExists(join(currentProject.root, f.relPath))) {
          conflicts.push(f.relPath);
        }
      }
    }
    return { plan: p, conflicts };
  };

  const create = async (input: ModulePanelInput) => {
    const root = currentProject?.root;
    if (!root) {
      return { ok: false, message: '未检测到 fcpp 项目。' };
    }
    const p = planModuleFiles(toPlanInput(input));
    if (!p.ok) {
      return { ok: false, message: `无法生成：${p.issues.join('；')}` };
    }
    const existing: string[] = [];
    for (const f of p.files) {
      if (await pathExists(join(root, f.relPath))) {
        existing.push(f.relPath);
      }
    }
    if (existing.length > 0) {
      return { ok: false, message: `以下文件已存在，请先删除或改名：${existing.join('、')}` };
    }
    const labels = p.files.map((f) => f.relPath).join(' 与 ');
    const choice = await vscode.window.showWarningMessage(`创建 ${labels}？`, { modal: true }, '创建', '取消');
    if (choice !== '创建') {
      return { ok: false, message: '已取消' };
    }
    for (const f of p.files) {
      await writeText(join(root, f.relPath), f.content);
    }
    await refreshStatus();
    return { ok: true, message: `已创建 ${labels}。可在命令行运行“构建”或继续添加测试。` };
  };

  showModuleWizardPanel(context, { plan, create });
}

/** Test generation Mode A (G-09): discover modules, preview, add-only create. */
function openTestgenPanel(context: vscode.ExtensionContext): void {
  const listModules = async (): Promise<DiscoveredModule[]> => {
    const root = currentProject?.root;
    if (!root) {
      return [];
    }
    const { readdir } = await import('node:fs/promises');
    let names: string[] = [];
    try {
      names = await readdir(join(root, 'include'));
    } catch {
      return [];
    }
    const modules: DiscoveredModule[] = [];
    for (const n of names.filter((f) => /\.(hpp|h)$/.test(f)).sort()) {
      let content = '';
      try {
        content = await readText(join(root, 'include', n));
      } catch {
        continue;
      }
      const count = scanHeader(content).length;
      if (count > 0) {
        modules.push({ name: n.replace(/\.(hpp|h)$/, ''), header: n, apiCount: count });
      }
    }
    return modules;
  };

  const create = async (moduleName: string) => {
    const root = currentProject?.root;
    if (!root) {
      return { ok: false, message: '未检测到 fcpp 项目。' };
    }
    const plan = await planModuleTests(root, moduleName);
    if (!plan.ok) {
      return { ok: false, message: `无法生成：${plan.issues.join('；')}` };
    }
    const target = join(root, plan.relPath);
    if (await pathExists(target)) {
      return { ok: false, message: `${plan.relPath} 已存在，未覆盖。` };
    }
    const choice = await vscode.window.showWarningMessage(`创建 ${plan.relPath}？只新增测试文件，不改 include/ 与 src/。`, {
      modal: true,
    }, '创建', '取消');
    if (choice !== '创建') {
      return { ok: false, message: '已取消' };
    }
    await writeText(target, plan.content);
    await refreshStatus();
    return { ok: true, message: `已创建 ${plan.relPath}。可运行「构建并测试」验证。` };
  };

  showTestgenPanel(context, {
    listModules,
    preview: (m) => {
      const root = currentProject?.root;
      return root ? planModuleTests(root, m) : Promise.resolve({ ok: false, issues: ['未检测到 fcpp 项目'], relPath: '', content: '' });
    },
    create,
  });
}

/** Coverage view (G-06): enable flag + run coverage build + open report. */
function openCoveragePanel(context: vscode.ExtensionContext): void {
  let reportCache = '';
  let reportCacheTime = 0;

  const locateReport = async (): Promise<string> => {
    const root = currentProject?.root;
    if (!root) {
      return '';
    }
    if (reportCache && Date.now() - reportCacheTime < 30_000) {
      return reportCache;
    }
    const { readdir } = await import('node:fs/promises');
    const hits: string[] = [];
    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 6 || hits.length > 0) {
        return;
      }
      let entries: { name: string; isDir: boolean }[] = [];
      try {
        const dirents = await readdir(dir, { withFileTypes: true });
        entries = dirents.map((d) => ({ name: d.name, isDir: d.isDirectory() }));
      } catch {
        return;
      }
      if (entries.some((e) => e.name === 'index.html' && dir.endsWith('coverage_report'))) {
        hits.push(join(dir, 'index.html'));
        return;
      }
      for (const e of entries) {
        if (e.isDir && !e.name.startsWith('.') && e.name !== 'node_modules') {
          await walk(join(dir, e.name), depth + 1);
        }
      }
    };
    // fast path first: project-local build trees
    await walk(join(root, 'build'), 0);
    await walk(join(root, 'coverage_report'), 0);
    if (hits.length === 0) {
      // fallback: conan cache test-package build dirs
      const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
      await walk(join(home, '.conan2', 'p'), 0);
    }
    reportCache = hits[0] ?? '';
    reportCacheTime = Date.now();
    return reportCache;
  };

  const getState = async (): Promise<CoverageState> => {
    const root = currentProject?.root;
    if (!root || !currentProject?.metadata) {
      return { projectName: '', enabled: false, reportPath: '' };
    }
    const meta = await loadMetadata(root);
    return {
      projectName: currentProject.metadata.name ?? '',
      enabled: meta.activate_code_coverage === true,
      reportPath: await locateReport(),
    };
  };

  const toggle = async (enabled: boolean) => {
    const root = currentProject?.root;
    if (!root) {
      return { ok: false, message: '未检测到 fcpp 项目。' };
    }
    const applied = await applyMetadataPatch(root, { activate_code_coverage: enabled }, { persist: true });
    reportCache = '';
    if (applied.ok) {
      await refreshStatus();
      return { ok: true, message: enabled ? '已开启 activate_code_coverage（备份 .bak）。' : '已关闭 activate_code_coverage。' };
    }
    return { ok: false, message: `写入失败：${applied.issues.map((i) => i.message).join('；')}` };
  };

  const runCoverage = async () => {
    const project = currentProject;
    if (!project || !project.metadata) {
      return { ok: false, message: '未检测到 fcpp 项目。' };
    }
    const meta = await loadMetadata(project.root);
    if (meta.activate_code_coverage !== true) {
      return { ok: false, message: '请先开启 activate_code_coverage（覆盖率需要 g++/gcov 工具链）。' };
    }
    const result = await runConanOnce(project);
    const issues = parseCompilerOutput(`${result.stdout}\n${result.stderr}`);
    mapIssues(issues, project.root);
    lastBuildOk = result.ok;
    reportCache = '';
    const report = await locateReport();
    if (!result.ok) {
      return { ok: false, message: '覆盖率构建失败：请查看“问题”面板。' };
    }
    if (report) {
      void vscode.env.openExternal(vscode.Uri.file(report));
      return { ok: true, message: `覆盖率构建成功，报告已打开：${report}` };
    }
    return { ok: false, message: '构建成功但未找到 coverage_report/index.html（MSVC 无法产出 gcov 报告，请用 g++/CI）。' };
  };

  showCoveragePanel(context, { getState, toggle, runCoverage });
}

/** Settings editor (G-17): preview + confirm + backup write of metadata.json. */
function openSettingsPanel(context: vscode.ExtensionContext): void {
  showSettingsPanel(context, {
    getMetadata: async () => {
      const root = currentProject?.root;
      if (!root) {
        return { error: '未检测到 fcpp 项目：请先打开含 metadata.json 的库文件夹。' };
      }
      try {
        return { metadata: await loadMetadata(root) };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
    savePatch: async (patch) => {
      const root = currentProject?.root;
      if (!root) {
        return { ok: false, message: '未检测到 fcpp 项目。', diff: [] };
      }
      const preview = await applyMetadataPatch(root, patch); // dry-run
      if (!preview.ok) {
        const detail = preview.issues
          .filter((i) => i.severity === 'error')
          .map((i) => `${i.field ?? '?'}: ${i.message}`)
          .join('；');
        return { ok: false, message: `校验未通过：${detail}`, diff: preview.diff };
      }
      const summary = preview.diff.length === 0 ? '（无字段变化）' : preview.diff.map((d) => d.field).join(', ');
      const choice = await vscode.window.showWarningMessage(
        `将写回 ${preview.diff.length} 项变更：${summary}。原文件会备份为 metadata.json.bak。`,
        { modal: true },
        '应用',
        '取消',
      );
      if (choice !== '应用') {
        return { ok: false, message: '已取消（未写回）', diff: preview.diff };
      }
      const applied = await applyMetadataPatch(root, patch, { persist: true });
      return {
        ok: applied.ok,
        message: applied.ok ? `已保存 ${applied.diff.length} 项变更（备份 .bak）` : '写回失败',
        diff: applied.diff,
      };
    },
    refreshProject: async () => {
      await refreshStatus();
    },
  });
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

/** Run `conan create` in the project and stream everything to the output channel. */
async function runConanOnce(project: FcppProject): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const conanExe = await locateConan();
  if (!conanExe) {
    throw new Error('找不到 conan。请先安装 Python + Conan（pip install conan; conan profile detect --force）。');
  }

  // Dev-machine adaptations (NOT shipped defaults): extra -pr profiles may be
  // needed to override e.g. the CMake version for newer VS generators.
  const configured = vscode.workspace.getConfiguration('het').get<string[]>('conan.profiles', []);
  const envProfiles = (process.env.HET_CONAN_PROFILES ?? '').split(';').filter((p) => p.length > 0);
  const profiles = [...configured, ...envProfiles];

  log(`[conan] ${conanExe} create . (Debug) in ${project.root}${profiles.length ? ` profiles=${profiles.join(',')}` : ''}`);
  const summary = await runConanCreate(
    conanExe,
    project.root,
    { buildType: 'Debug', profiles },
    {
      onStdout: (c) => channel?.append(c),
      onStderr: (c) => channel?.append(c),
      timeoutMs: 0,
    },
  );
  lastConanOutput = `${summary.stdout}\n${summary.stderr}`;
  channel?.appendLine('');
  return { ok: summary.ok, stdout: summary.stdout, stderr: summary.stderr };
}

/** Run `conan create` for the current project; map diagnostics to the Problems panel. */
async function buildProject(): Promise<void> {
  const project = currentProject;
  if (!project || !project.metadata) {
    void vscode.window.showWarningMessage('未检测到 fcpp 项目：请先打开含 metadata.json 的库文件夹。');
    return;
  }
  buildDiagnostics.clear();

  let result: { ok: boolean; stdout: string; stderr: string };
  try {
    result = await runConanOnce(project);
  } catch (err) {
    void vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
    return;
  }

  const issues = parseCompilerOutput(`${result.stdout}\n${result.stderr}`);
  mapIssues(issues, project.root);
  log(`[build] finished ok=${result.ok} issues=${issues.length}`);
  lastBuildOk = result.ok;

  if (result.ok) {
    void vscode.window.showInformationMessage(`构建成功 — ${project.metadata.name} (Debug)`);
  } else {
    const detail = issues.length > 0 ? `${issues.length} 个错误/警告，详见“问题”面板` : '详见“输出 → HeT DevTools”';
    void vscode.window.showErrorMessage(`构建失败：${detail}`);
  }
}

/**
 * One full "build + run tests" cycle, shared by the het.test command and the
 * Test Explorer controller: runs conan create, maps diagnostics, records the
 * parsed summary and last output, and returns the raw result.
 */
async function executeTestRun(): Promise<{ ok: boolean; stdout: string; stderr: string } | undefined> {
  const project = currentProject;
  if (!project || !project.metadata) {
    void vscode.window.showWarningMessage('未检测到 fcpp 项目：请先打开含 metadata.json 的库文件夹。');
    return undefined;
  }

  let result: { ok: boolean; stdout: string; stderr: string };
  try {
    result = await runConanOnce(project);
  } catch (err) {
    lastConanOutput = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
    return undefined;
  }

  const fullOutput = `${result.stdout}\n${result.stderr}`;
  const issues = parseCompilerOutput(fullOutput);
  mapIssues(issues, project.root);

  lastBuildOk = result.ok;
  lastTestSummary = parseGTestOutput(fullOutput);
  log(
    `[test] ok=${result.ok} gtest=${JSON.stringify({ p: lastTestSummary.passed, f: lastTestSummary.failed, s: lastTestSummary.skipped })}`,
  );
  return result;
}

/** Run `conan create` (includes the test package step) and show a parsed test view. */
async function runTests(): Promise<void> {
  const project = currentProject;
  if (!project || !project.metadata) {
    void vscode.window.showWarningMessage('未检测到 fcpp 项目：请先打开含 metadata.json 的库文件夹。');
    return;
  }

  const result = await executeTestRun();
  if (!result) {
    return;
  }

  if (!result.ok) {
    void vscode.window.showErrorMessage('构建/测试失败：先修复构建错误（见问题面板），再重新测试。');
    return;
  }
  if (lastTestSummary?.empty) {
    void vscode.window.showInformationMessage(
      '构建成功，但未捕获到 GTest 用例。请确认 metadata.json 的 trigger_tests=true 且 test_package/test/unit 下有测试。',
    );
    return;
  }
  void vscode.window.showInformationMessage(
    `测试完成：通过 ${lastTestSummary?.passed ?? 0} · 失败 ${lastTestSummary?.failed ?? 0} · 跳过 ${lastTestSummary?.skipped ?? 0}`,
  );
  if (lastTestSummary) {
    showTestResults(contextRef, lastTestSummary);
  }
}

function showStoredTestResults(context: vscode.ExtensionContext): void {
  if (!lastTestSummary) {
    void vscode.window.showInformationMessage('尚无测试结果。先运行：HeT DevTools: 构建并测试。');
    return;
  }
  showTestResults(context, lastTestSummary);
}

let contextRef: vscode.ExtensionContext;

function showTestResults(context: vscode.ExtensionContext, summary: GTestRunSummary): void {
  contextRef = context;
  showTestResultsPanel(context, summary, {
    runTests: () => void runTests(),
    openFile: (file, line) => openFileAt(file, line),
  });
}

/** Open a (possibly relative) file at a 1-based line. */
async function openFileAt(file: string, line: number): Promise<void> {
  const root = currentProject?.root;
  const abs = isAbsolute(file) ? file : root ? join(root, file) : file;
  try {
    const doc = await vscode.workspace.openTextDocument(abs);
    const editor = await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.One });
    const pos = new vscode.Position(Math.max(0, line - 1), 0);
    editor.revealRange(new vscode.Range(pos, pos));
  } catch (err) {
    void vscode.window.showWarningMessage(`无法打开 ${abs}：${err instanceof Error ? err.message : String(err)}`);
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

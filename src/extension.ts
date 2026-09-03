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
import { DiscoveredModule, ModeBInput, ModeBPreview, showTestgenPanel } from './features/testgen/panel';
import { CoverageState, showCoveragePanel } from './features/coverage/panel';
import { DocsState, DocToolStatus, showDocsPanel } from './features/docs/panel';
import { QualityRow, QualityRunResult, showQualityPanel } from './features/quality/panel';
import { CommitRequest, CommitState, showCommitPanel } from './features/commit/panel';
import { ReleaseState, showReleasePanel } from './features/release/panel';
import { PreflightState, PreflightItem, showPreflightPanel } from './features/preflight/panel';
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
import { parseBlueprint, renderContractTest, renderImplementationPlan } from './core/testgenModeB';
import { composeHeader, defaultEmoji, parsePorcelain, suggestType, TRIGGER_EMOJIS } from './core/commitAssistant';
import { applyMetadataPatch, loadMetadata, validateMetadata, hasErrors } from './core/metadataService';
import { formatConfigForFile, parseClangFormatOutput, parseClangTidyOutput, lintCommitHeader, collectHeaders, QualityIssue } from './core/qualityGates';
import { pathExists, readText, writeJson, writeText } from './utils/fs';
import { run, which } from './utils/exec';
import { docsOptions, graphvizMismatch } from './core/docsService';
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
    vscode.commands.registerCommand('het.docs', () => openDocsPanel(context)),
    vscode.commands.registerCommand('het.quality', () => openQualityPanel(context)),
    vscode.commands.registerCommand('het.commit', () => openCommitPanel(context)),
    vscode.commands.registerCommand('het.commitRelease', () => openCommitPanel(context, { type: 'chore', emoji: ':package:', subject: 'bump version' })),
    vscode.commands.registerCommand('het.release', () => openReleasePanel(context)),
    vscode.commands.registerCommand('het.preflight', () => openPreflightPanel(context)),
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

  const modeBPlan = (input: ModeBInput): { ok: boolean; issues: string[]; testRelPath: string; planRelPath: string; testContent: string; planContent: string; contractCount: number } | null => {
    const name = input.moduleName.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      return { ok: false, issues: ['模块名须为小写标识符（字母开头，仅 a-z/0-9/_）'], testRelPath: '', planRelPath: '', testContent: '', planContent: '', contractCount: 0 };
    }
    const parsed = parseBlueprint(input.blueprint);
    if (!parsed.ok) {
      return { ok: false, issues: parsed.issues, testRelPath: '', planRelPath: '', testContent: '', planContent: '', contractCount: 0 };
    }
    const title = input.title.trim() || `${name} 蓝图`;
    const notes = [`Blueprint: ${title}`, 'Test-first: implement until these contract cases go green.'];
    const testRelPath = `test_package/test/unit/${name}_contract_test.cpp`;
    const planRelPath = `workspace/${name}-blueprint-plan.md`;
    return {
      ok: true,
      issues: [],
      testRelPath,
      planRelPath,
      testContent: renderContractTest(name, parsed.contracts, notes),
      planContent: renderImplementationPlan(name, 'src', parsed.contracts, title),
      contractCount: parsed.contracts.length,
    };
  };

  const createModeB = async (input: ModeBInput) => {
    const root = currentProject?.root;
    if (!root) {
      return { ok: false, message: '未检测到 fcpp 项目。' };
    }
    const plan = modeBPlan(input);
    if (!plan || !plan.ok) {
      return { ok: false, message: `无法生成：${plan?.issues.join('；') ?? '输入无效'}` };
    }
    const existing = [plan.testRelPath, plan.planRelPath].filter((p) => p !== '');
    const hits: string[] = [];
    for (const p of existing) {
      if (await pathExists(join(root, p))) {
        hits.push(p);
      }
    }
    if (hits.length > 0) {
      return { ok: false, message: `以下文件已存在，请先删除或改名：${hits.join('、')}` };
    }
    const choice = await vscode.window.showWarningMessage(
      `写入契约测试与实现计划？\n  ${plan.testRelPath}\n  ${plan.planRelPath}\nMode B 不创建 include/src（按计划另行实现）。`,
      { modal: true },
      '写入',
      '取消',
    );
    if (choice !== '写入') {
      return { ok: false, message: '已取消' };
    }
    await writeText(join(root, plan.testRelPath), plan.testContent);
    await writeText(join(root, plan.planRelPath), plan.planContent);
    await refreshStatus();
    return { ok: true, message: `已生成契约测试与实现计划。按计划实现模块后运行「构建并测试」使契约转绿。` };
  };

  showTestgenPanel(context, {
    listModules,
    preview: (m) => {
      const root = currentProject?.root;
      return root ? planModuleTests(root, m) : Promise.resolve({ ok: false, issues: ['未检测到 fcpp 项目'], relPath: '', content: '' });
    },
    create,
    planModeB: (input) => {
      const plan = modeBPlan(input);
      return Promise.resolve(
        plan
          ? (plan as ModeBPreview)
          : { ok: false, issues: ['输入无效'], testRelPath: '', planRelPath: '', testContent: '', planContent: '', contractCount: 0 },
      );
    },
    createModeB,
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

/** Docs center (G-10): run docs/build.py, D-10 graphviz banner, open artifacts. */
function openDocsPanel(context: vscode.ExtensionContext): void {
  const locateArtifacts = async (root: string): Promise<{ rel: string; abs: string }[]> => {
    const { readdir } = await import('node:fs/promises');
    const hits: { rel: string; abs: string }[] = [];
    const walk = async (dir: string, relBase: string, depth: number): Promise<void> => {
      if (depth > 7) {
        return;
      }
      let entries: { name: string; isDir: boolean }[] = [];
      try {
        const ds = await readdir(dir, { withFileTypes: true });
        entries = ds.map((d) => ({ name: d.name, isDir: d.isDirectory() }));
      } catch {
        return;
      }
      for (const e of entries) {
        const abs = join(dir, e.name);
        const rel = `${relBase}/${e.name}`;
        if (!e.isDir && e.name === 'index.html') {
          hits.push({ rel, abs });
        } else if (e.isDir && !e.name.startsWith('.') && e.name !== 'node_modules') {
          await walk(abs, rel, depth + 1);
        }
      }
    };
    await walk(join(root, 'docs', 'sphinx', 'build'), 'docs/sphinx/build', 0);
    await walk(join(root, 'docs', 'doxygen', 'build'), 'docs/doxygen/build', 0);
    return hits.sort((a, b) => a.rel.localeCompare(b.rel));
  };

  const getState = async (): Promise<DocsState> => {
    const root = currentProject?.root;
    if (!root || !currentProject?.metadata) {
      return { projectName: '', languages: [], versions: [], tools: [], graphvizMismatch: false, graphvizCurrent: '', graphvizExpected: '', artifacts: [] };
    }
    const meta = await loadMetadata(root);
    const dotExe = await which('dot');
    const gv = graphvizMismatch(meta, dotExe);
    const tools: DocToolStatus[] = [
      { name: 'Python', ok: (await which('python')) !== null },
      { name: 'Doxygen', ok: (await which('doxygen')) !== null },
      { name: 'Graphviz (dot)', ok: dotExe !== null },
      { name: 'Sphinx', ok: (await which('sphinx-build')) !== null },
      { name: 'make', ok: process.platform !== 'win32' || (await which('make')) !== null, note: process.platform === 'win32' ? 'Sphinx 段需要' : undefined },
    ];
    const opts = docsOptions(meta);
    return {
      projectName: currentProject.metadata.name ?? '',
      languages: opts.languages,
      versions: opts.versions,
      tools,
      graphvizMismatch: gv.mismatch,
      graphvizCurrent: gv.current,
      graphvizExpected: gv.expected,
      artifacts: await locateArtifacts(root),
    };
  };

  const runDocs = async () => {
    const root = currentProject?.root;
    if (!root) {
      return { ok: false, message: '未检测到 fcpp 项目。' };
    }
    const python = await which('python');
    if (!python) {
      return { ok: false, message: '找不到 python（docs/build.py 需要）。请先安装 Python 3.10+。' };
    }
    channel?.appendLine(`[docs] ${python} docs/build.py @ ${root}`);
    const result = await run(python, ['docs/build.py'], {
      cwd: root,
      onStdout: (c) => channel?.append(c),
      onStderr: (c) => channel?.append(c),
      timeoutMs: 0,
    });
    const artifacts = await locateArtifacts(root);
    const ok = result.code === 0;
    log(`[docs] finished ok=${ok} artifacts=${artifacts.length}`);
    if (!ok) {
      return { ok: false, message: '文档生成失败：请查看“输出 → HeT DevTools”中的原始日志（常见：注释标注/工具缺失）。' };
    }
    return { ok: true, message: `文档生成完成，找到 ${artifacts.length} 个产物页面。` };
  };

  const fixGraphviz = async () => {
    const root = currentProject?.root;
    if (!root) {
      return { ok: false, message: '未检测到 fcpp 项目。' };
    }
    const dotExe = await which('dot');
    const meta = await loadMetadata(root);
    const gv = graphvizMismatch(meta, dotExe);
    if (!gv.mismatch || !gv.expected) {
      return { ok: false, message: '无需修正（未配置或已匹配）。' };
    }
    const choice = await vscode.window.showWarningMessage(
      `把 graphviz_bin 从 ${gv.current} 改为 ${gv.expected}？\n注意：这是机器相关路径，提交前请还原或忽略该行。`,
      { modal: true },
      '修正',
      '取消',
    );
    if (choice !== '修正') {
      return { ok: false, message: '已取消' };
    }
    const applied = await applyMetadataPatch(root, { graphviz_bin: gv.expected }, { persist: true });
    if (applied.ok) {
      await refreshStatus();
      return { ok: true, message: '已本机修正 graphviz_bin（已备份 .bak）。提交前请还原该字段。' };
    }
    return { ok: false, message: `写入失败：${applied.issues.map((i) => i.message).join('；')}` };
  };

  const openArtifact = async (rel: string) => {
    const root = currentProject?.root;
    if (!root) {
      return;
    }
    const abs = join(root, rel);
    if (await pathExists(abs)) {
      void vscode.env.openExternal(vscode.Uri.file(abs));
    }
  };

  showDocsPanel(context, { getState, runDocs, fixGraphviz, openArtifact });
}

/** Quality & security panel (G-11): native gates, degraded gracefully. */
function openQualityPanel(context: vscode.ExtensionContext): void {
  const listSourceFiles = async (root: string): Promise<{ rel: string; abs: string; family: 'c' | 'cpp' }[]> => {
    const { readdir } = await import('node:fs/promises');
    const out: { rel: string; abs: string; family: 'c' | 'cpp' }[] = [];
    for (const sub of ['include', 'src']) {
      const dir = join(root, sub);
      let names: string[] = [];
      try {
        names = await readdir(dir);
      } catch {
        continue;
      }
      for (const n of names) {
        const fam = formatConfigForFile(`${sub}/${n}`);
        if (fam) {
          out.push({ rel: `${sub}/${n}`, abs: join(dir, n), family: fam });
        }
      }
    }
    return out;
  };

  const gateRows = async (): Promise<QualityRow[]> => {
    const [fmt, tidy, gitLeaks, docker] = await Promise.all([
      which('clang-format'),
      which('clang-tidy'),
      which('gitleaks'),
      which('docker'),
    ]);
    return [
      {
        id: 'format',
        label: '格式检查 (clang-format)',
        tool: fmt ? 'clang-format · 双配置 C/C++' : 'clang-format 未安装',
        status: fmt ? 'idle' : 'na',
        detail: fmt ? undefined : '安装：pip install clang-format（本地绿=CI 绿，warning 即失败）',
      },
      {
        id: 'tidy',
        label: '静态检查 (clang-tidy)',
        tool: tidy ? 'clang-tidy · WarningsAsErrors' : 'clang-tidy 未安装',
        status: tidy ? 'idle' : 'na',
        detail: tidy ? undefined : '本机未安装 clang-tidy（CI 原生门禁），可经 LLVM/conda 安装后本地自检。',
      },
      {
        id: 'schema',
        label: '配置校验 (schema)',
        tool: 'metadata.json',
        status: 'idle',
      },
      {
        id: 'commitlint',
        label: '提交信息规范 (commitlint)',
        tool: '最近 10 次提交',
        status: 'idle',
      },
      {
        id: 'gitleaks',
        label: '密钥扫描 (gitleaks)',
        tool: gitLeaks ? 'gitleaks' : 'gitleaks 未安装',
        status: gitLeaks ? 'idle' : 'na',
        detail: gitLeaks ? undefined : 'CI 原生门禁（.github/misc/.gitleaks.toml）；本地安装 gitleaks 后可用。',
      },
      {
        id: 'megalinter',
        label: '深度扫描 (MegaLinter / SAST, advisory)',
        tool: docker ? 'Docker 可用' : '需要 Docker',
        status: docker ? 'idle' : 'na',
        detail: docker ? undefined : 'MegaLinter 为 advisory（semgrep/checkov/devskim）。安装 Docker 后通过 run-megalinter.sh 运行。',
      },
    ];
  };

  const runRow = async (rowId: string): Promise<QualityRunResult> => {
    const root = currentProject?.root;
    const err = (summary: string, errors: string[]): QualityRunResult => ({
      rowId,
      status: 'fail',
      summary,
      issues: [],
      errors,
    });
    const na = (summary: string, errors: string[]): QualityRunResult => ({ rowId, status: 'na', summary, issues: [], errors });
    if (!root) {
      return err('未检测到 fcpp 项目', []);
    }
    if (rowId === 'format') {
      const tool = await which('clang-format');
      if (!tool) {
        return na('格式检查不可用', ['缺少 clang-format：pip install clang-format']);
      }
      const files = await listSourceFiles(root);
      if (files.length === 0) {
        return { rowId, status: 'pass', summary: '无 include/src 源文件', issues: [], errors: [] };
      }
      const issues: QualityIssue[] = [];
      const errors: string[] = [];
      const toRel = (p: string): string => (p.startsWith(root) ? p.slice(root.length).replace(/^[\\/]+/, '') : p);
      for (const family of ['c', 'cpp'] as const) {
        const famFiles = files.filter((f) => f.family === family);
        if (famFiles.length === 0) {
          continue;
        }
        const cfg = join(root, `.github/misc/.clang-format-${family}`);
        if (!(await pathExists(cfg))) {
          errors.push(`缺少配置文件 .github/misc/.clang-format-${family}（从 fcpp 模板同步）。`);
          continue;
        }
        const res = await run(tool, ['--dry-run', '--Werror', `--style=file:${cfg}`, ...famFiles.map((f) => f.abs)], { cwd: root });
        issues.push(
          ...parseClangFormatOutput(`${res.stdout}\n${res.stderr}`).map((i) => ({ ...i, file: toRel(i.file) })),
        );
      }
      if (errors.length > 0) {
        return err('格式检查未能完整运行', errors);
      }
      if (issues.length > 0) {
        return { rowId, status: 'fail', summary: `格式检查失败：${issues.length} 个文件不符合格式`, issues, errors: [] };
      }
      return { rowId, status: 'pass', summary: '格式检查通过（所有 C/C++ 文件已 clang-formatted）', issues: [], errors: [] };
    }
    if (rowId === 'tidy') {
      const tool = await which('clang-tidy');
      if (!tool) {
        return na('静态检查不可用', ['缺少 clang-tidy']);
      }
      const cfg = join(root, '.github/misc/.clang-tidy');
      if (!(await pathExists(cfg))) {
        return na('静态检查不可用', ['缺少 .github/misc/.clang-tidy 配置文件']);
      }
      const files = (await listSourceFiles(root)).filter((f) => f.family === 'cpp').map((f) => f.abs);
      if (files.length === 0) {
        return { rowId, status: 'pass', summary: '无 C++ 源文件', issues: [], errors: [] };
      }
      const res = await run(tool, [`--config-file=${join(root, '.github/misc/.clang-tidy')}`, ...files, '--', '-std=c++17', '-Iinclude'], {
        cwd: root,
        timeoutMs: 0,
      });
      const issues = parseClangTidyOutput(`${res.stdout}\n${res.stderr}`);
      if (issues.length > 0 || res.code !== 0) {
        return { rowId, status: 'fail', summary: `静态检查失败：${issues.length} 条诊断（WarningsAsErrors）`, issues, errors: [] };
      }
      return { rowId, status: 'pass', summary: '静态检查通过', issues: [], errors: [] };
    }
    if (rowId === 'schema') {
      let meta;
      try {
        meta = await loadMetadata(root);
      } catch (e) {
        return err('metadata.json 读取失败', [e instanceof Error ? e.message : String(e)]);
      }
      const issues = validateMetadata(meta);
      if (hasErrors(issues)) {
        return {
          rowId,
          status: 'fail',
          summary: `配置校验失败：${issues.filter((i) => i.severity === 'error').length} 个错误`,
          issues: [],
          errors: issues.map((i) => `${i.field}: ${i.message}`),
        };
      }
      return { rowId, status: 'pass', summary: '配置校验通过（metadata.json 合规）', issues: [], errors: [] };
    }
    if (rowId === 'commitlint') {
      const git = await which('git');
      if (!git) {
        return na('提交规范检查不可用', ['缺少 git']);
      }
      const res = await run(git, ['-C', root, 'log', '--format=%s', '-n', '10']);
      const errors: string[] = [];
      for (const h of collectHeaders(res.stdout)) {
        const r = lintCommitHeader(h);
        if (!r.ok) {
          errors.push(`${h}\n    → ${r.errors.join('；')}`);
        }
      }
      if (errors.length > 0) {
        return { rowId, status: 'fail', summary: `commitlint：最近 10 次提交中 ${errors.length} 条不合规`, issues: [], errors };
      }
      return { rowId, status: 'pass', summary: 'commitlint：最近 10 次提交全部合规', issues: [], errors: [] };
    }
    if (rowId === 'gitleaks') {
      const tool = await which('gitleaks');
      if (!tool) {
        return na('密钥扫描不可用', ['缺少 gitleaks（CI 原生门禁）。本地可选安装后启用。']);
      }
      const cfg = join(root, '.github/misc/.gitleaks.toml');
      const res = await run(tool, ['detect', '--source', root, '--config', cfg, '--no-banner', '--redact'], { cwd: root, timeoutMs: 0 });
      if (res.code === 0) {
        return { rowId, status: 'pass', summary: '密钥扫描通过（未发现泄露）', issues: [], errors: [] };
      }
      return { rowId, status: 'fail', summary: '密钥扫描发现潜在泄露', issues: [], errors: [`${res.stdout}\n${res.stderr}`.slice(-2000)] };
    }
    if (rowId === 'megalinter') {
      const docker = await which('docker');
      if (!docker) {
        return na('MegaLinter 不可用', ['需要 Docker（advisory SAST）。安装 Docker 后本项自动启用。']);
      }
      const script = join(root, '.github/misc/run-megalinter.sh');
      if (!(await pathExists(script))) {
        return na('MegaLinter 不可用', ['缺少 .github/misc/run-megalinter.sh（从 fcpp 模板同步）。']);
      }
      const res = await run('bash', [script], { cwd: root, timeoutMs: 0 });
      const out = `${res.stdout}\n${res.stderr}`;
      if (res.code === 0) {
        return { rowId, status: 'pass', summary: 'MegaLinter SAST 通过（advisory）', issues: [], errors: [] };
      }
      return { rowId, status: 'fail', summary: 'MegaLinter 报告问题（advisory，可先查看报告目录）', issues: [], errors: [out.slice(-2000)] };
    }
    return err('未知检查项', []);
  };

  const fixFormat = async () => {
    const root = currentProject?.root;
    if (!root) {
      return { ok: false, message: '未检测到 fcpp 项目。' };
    }
    const tool = await which('clang-format');
    if (!tool) {
      return { ok: false, message: '缺少 clang-format：pip install clang-format' };
    }
    const files = await listSourceFiles(root);
    if (files.length === 0) {
      return { ok: false, message: '无 include/src 源文件' };
    }
    const choice = await vscode.window.showWarningMessage(
      `对 ${files.length} 个 C/C++ 文件执行 clang-format -i？（include/ 与 src/ 下全部）`,
      { modal: true },
      '修复',
      '取消',
    );
    if (choice !== '修复') {
      return { ok: false, message: '已取消' };
    }
    let fixed = 0;
    for (const family of ['c', 'cpp'] as const) {
      const famFiles = files.filter((f) => f.family === family).map((f) => f.abs);
      if (famFiles.length === 0) {
        continue;
      }
      const cfg = join(root, `.github/misc/.clang-format-${family}`);
      if (!(await pathExists(cfg))) {
        continue;
      }
      const res = await run(tool, ['-i', `--style=file:${cfg}`, ...famFiles], { cwd: root });
      if (res.code === 0) {
        fixed += famFiles.length;
      }
    }
    return { ok: true, message: fixed > 0 ? `已格式化 ${fixed} 个文件。` : '没有可修复的文件（配置缺失）。' };
  };

  showQualityPanel(context, {
    getRows: gateRows,
    runRow,
    fixFormat,
    openIssue: async (file, line) => {
      const root = currentProject?.root;
      if (!root) {
        return;
      }
      const abs = (await pathExists(join(root, file))) ? join(root, file) : file;
      void vscode.window.showTextDocument(vscode.Uri.file(abs), {
        selection: line ? new vscode.Range(line - 1, 0, line - 1, 0) : undefined,
        preview: true,
      });
    },
  });
}

/** Commit assistant (G-16): dual-channel conventional commits, preview + confirm. */
function openCommitPanel(context: vscode.ExtensionContext, prefill?: { type: string; emoji: string | null; subject: string }): void {
  const gitRun = async (args: string[], cwd: string) => {
    const git = await which('git');
    if (!git) {
      return null;
    }
    return run(git, ['-C', cwd, ...args], { cwd });
  };

  const getState = async (): Promise<CommitState> => {
    const root = currentProject?.root;
    if (!root || !currentProject?.metadata) {
      return { projectName: '', branch: '', changes: [], triggers: {}, buildType: '', triggerTests: false, suggestedType: 'chore', suggestedEmojiId: null, initialSubject: '' };
    }
    const meta = await loadMetadata(root);
    const triggers: Record<string, boolean> = { ...(meta.workflow_triggers ?? {}) };
    let branch = '';
    let changes: { path: string; staged: boolean; status: string }[] = [];
    const st = await gitRun(['status', '--porcelain'], root);
    if (st) {
      changes = parsePorcelain(st.stdout);
      const br = await gitRun(['branch', '--show-current'], root);
      branch = br ? br.stdout.trim() : '';
    }
    const paths = changes.map((c) => c.path);
    const suggestedType = prefill?.type ?? suggestType(paths);
    const emoji =
      prefill?.type && prefill.emoji !== undefined
        ? { id: TRIGGER_EMOJIS.find((t) => t.emoji === prefill.emoji)?.id ?? '', emoji: prefill.emoji }
        : defaultEmoji(suggestedType as never, {
            triggers,
            buildType: meta.build_type ?? 'Debug',
            triggerTests: meta.trigger_tests === true,
          });
    return {
      projectName: currentProject.metadata.name ?? '',
      branch,
      changes,
      triggers,
      buildType: meta.build_type ?? 'Debug',
      triggerTests: meta.trigger_tests === true,
      suggestedType,
      suggestedEmojiId: emoji?.id ?? null,
      initialSubject: prefill?.subject ?? '',
    };
  };

  const commit = async (req: CommitRequest) => {
    const root = currentProject?.root;
    if (!root) {
      return { ok: false, message: '未检测到 fcpp 项目。' };
    }
    if (req.paths.length === 0) {
      return { ok: false, message: '请至少勾选一个变更文件。' };
    }
    if (!req.subject.trim()) {
      return { ok: false, message: '请填写一句话描述。' };
    }
    const header = composeHeader(req.type as never, req.emoji, req.breaking, req.subject);
    const lint = lintCommitHeader(header);
    if (!lint.ok) {
      return { ok: false, message: `commitlint 未通过：${lint.errors.join('；')}` };
    }
    const branch = req.push
      ? await gitRun(['branch', '--show-current'], root).then((r) => (r ? r.stdout.trim() : ''))
      : '';
    const pushNote = req.push ? `，然后推送到 ${branch || '当前分支'}` : '（不推送）';
    const choice = await vscode.window.showWarningMessage(
      `提交 ${req.paths.length} 个文件？\n\n${header}${pushNote}\n\n（提交助手默认只 commit，推送需显式确认）`,
      { modal: true },
      '提交',
      '取消',
    );
    if (choice !== '提交') {
      return { ok: false, message: '已取消' };
    }
    const add = await gitRun(['add', '--', ...req.paths], root);
    if (!add) {
      return { ok: false, message: '找不到 git。' };
    }
    const c = await gitRun(['commit', '-m', header], root);
    const out = c ? `${c.stdout}\n${c.stderr}` : '';
    if (!c || c.code !== 0) {
      return { ok: false, message: `提交失败（无暂存改动或错误）：\n${out.slice(-800)}` };
    }
    if (req.push) {
      if (!branch) {
        return { ok: true, message: '已提交，但无法确定分支名，跳过推送。请手动推送。' };
      }
      const p = await gitRun(['push', 'origin', branch], root);
      if (!p || p.code !== 0) {
        return { ok: false, message: `已提交但推送失败：\n${(p ? `${p.stdout}\n${p.stderr}` : '').slice(-800)}` };
      }
    }
    await refreshStatus();
    return { ok: true, message: req.push ? `已提交并推送：${header}` : `已提交：${header}` };
  };

  showCommitPanel(context, { getState, commit });
}

/** Release center (G-12): workflow_triggers.release + guided 📦 flow. */
function openReleasePanel(context: vscode.ExtensionContext): void {
  const getState = async (): Promise<ReleaseState> => {
    const root = currentProject?.root;
    if (!root || !currentProject?.metadata) {
      return { projectName: '', version: '', buildType: '', releaseOn: false, docsOn: false, changelogExists: false, changelogHead: '', hasRemote: false };
    }
    const meta = await loadMetadata(root);
    const triggers: Record<string, boolean> = { ...(meta.workflow_triggers ?? {}) };
    let changelogHead = '';
    let changelogExists = false;
    const cl = join(root, 'CHANGELOG.md');
    if (await pathExists(cl)) {
      changelogExists = true;
      try {
        changelogHead = (await readText(cl)).slice(0, 2000);
      } catch {
        /* ignore */
      }
    }
    let hasRemote = false;
    const git = await which('git');
    if (git) {
      const r = await run(git, ['-C', root, 'remote', 'get-url', 'origin']).catch(() => null);
      hasRemote = !!r && r.code === 0 && r.stdout.trim().length > 0;
    }
    return {
      projectName: currentProject.metadata.name ?? '',
      version: meta.version ?? '',
      buildType: meta.build_type ?? '',
      releaseOn: triggers.release === true,
      docsOn: triggers.docs === true,
      changelogExists,
      changelogHead,
      hasRemote,
    };
  };

  const toggleRelease = async () => {
    const root = currentProject?.root;
    if (!root) {
      return { ok: false, message: '未检测到 fcpp 项目。' };
    }
    const meta = await loadMetadata(root);
    const triggers: Record<string, boolean> = { ...(meta.workflow_triggers ?? {}) };
    triggers.release = true;
    const choice = await vscode.window.showWarningMessage(
      `开启发布：写入 workflow_triggers.release=true 并将 build_type 设为 Release？\n（发布不可回滚，CI 收到 📦 提交后自动发版）`,
      { modal: true },
      '开启',
      '取消',
    );
    if (choice !== '开启') {
      return { ok: false, message: '已取消' };
    }
    const applied = await applyMetadataPatch(root, { workflow_triggers: triggers, build_type: 'Release' }, { persist: true });
    if (applied.ok) {
      await refreshStatus();
      return { ok: true, message: '已开启发布（备份 .bak）。用「提交助手并预填 📦」发起发布提交。' };
    }
    return { ok: false, message: `写入失败：${applied.issues.map((i) => i.message).join('；')}` };
  };

  showReleasePanel(context, {
    getState,
    toggleRelease,
    openCommitRelease: async () => {
      await vscode.commands.executeCommand('het.commitRelease');
    },
    openChangelog: async () => {
      const root = currentProject?.root;
      if (root) {
        void vscode.window.showTextDocument(vscode.Uri.file(join(root, 'CHANGELOG.md')), { preview: true });
      }
    },
  });
}

/** Pre-release gate (G-13): checklist aligned with CI gates. */
function openPreflightPanel(context: vscode.ExtensionContext): void {
  const getState = async (): Promise<PreflightState> => {
    const root = currentProject?.root;
    const items: PreflightItem[] = [];
    if (!root || !currentProject?.metadata) {
      return { projectName: '', items: [], passed: 0, total: 0, allowRelease: false };
    }
    const meta = await loadMetadata(root);

    // 1) build (session evidence)
    items.push({
      label: '构建成功',
      ok: lastBuildOk === undefined ? undefined : lastBuildOk,
      detail: lastBuildOk === undefined ? '本会话尚未构建 → 点击「运行构建并测试」' : lastBuildOk ? '最近一次构建成功' : '最近一次构建失败',
      required: true,
    });
    // 2) tests (session evidence)
    items.push({
      label: '测试全绿',
      ok: lastTestSummary ? lastTestSummary.failed === 0 && lastTestSummary.passed > 0 : undefined,
      detail: lastTestSummary
        ? `通过 ${lastTestSummary.passed} · 失败 ${lastTestSummary.failed} · 跳过 ${lastTestSummary.skipped}`
        : '本会话尚未运行测试',
      required: true,
    });

    // 3) quality (format quick + schema + commitlint)
    const tool = await which('clang-format');
    const files = await (async () => {
      const { readdir } = await import('node:fs/promises');
      const out: { abs: string; fam: 'c' | 'cpp' }[] = [];
      for (const sub of ['include', 'src']) {
        try {
          for (const n of await readdir(join(root, sub))) {
            const fam = formatConfigForFile(`${sub}/${n}`);
            if (fam) {
              out.push({ abs: join(root, sub, n), fam });
            }
          }
        } catch {
          /* missing dir */
        }
      }
      return out;
    })();
    let formatOk: boolean | undefined;
    if (tool && files.length > 0) {
      let allOk = true;
      for (const fam of ['c', 'cpp'] as const) {
        const famFiles = files.filter((f) => f.fam === fam).map((f) => f.abs);
        if (famFiles.length === 0) {
          continue;
        }
        const cfg = join(root, `.github/misc/.clang-format-${fam}`);
        if (!(await pathExists(cfg))) {
          allOk = false;
          break;
        }
        const res = await run(tool, ['--dry-run', '--Werror', `--style=file:${cfg}`, ...famFiles], { cwd: root });
        if (res.code !== 0) {
          allOk = false;
        }
      }
      formatOk = allOk;
    }
    let schemaOk = true;
    const schemaIssues = validateMetadata(meta);
    if (hasErrors(schemaIssues)) {
      schemaOk = false;
    }
    let commitOk = true;
    const git = await which('git');
    if (git) {
      const res = await run(git, ['-C', root, 'log', '--format=%s', '-n', '10']);
      for (const h of collectHeaders(res.stdout)) {
        if (!lintCommitHeader(h).ok) {
          commitOk = false;
        }
      }
    }
    const qualityOk = formatOk === true && schemaOk && commitOk;
    items.push({
      label: '质量门禁（format/schema/commitlint）',
      ok: formatOk === undefined ? undefined : qualityOk,
      detail:
        formatOk === undefined
          ? 'clang-format 不可用或配置缺失 → 在质量面板查看'
          : qualityOk
            ? '格式/配置/提交规范均绿'
            : `格式：${formatOk ? '绿' : '红'} · schema：${schemaOk ? '绿' : '红'} · commitlint：${commitOk ? '绿' : '红'}`,
      required: false,
    });

    // 4) docs tools (advisory)
    const docsNeed = ['python', 'doxygen', 'dot', 'sphinx-build'];
    const missing: string[] = [];
    if (process.platform === 'win32' && !(await which('make'))) {
      missing.push('make');
    }
    for (const d of docsNeed) {
      if (!(await which(d))) {
        missing.push(d);
      }
    }
    items.push({
      label: '文档可生成（工具齐全）',
      ok: missing.length === 0,
      detail: missing.length ? `缺少：${missing.join('、')}` : 'Doxygen/Sphinx/Graphviz 齐备',
      required: false,
    });

    // 5) working tree clean
    let clean = true;
    if (git) {
      const res = await run(git, ['-C', root, 'status', '--porcelain']);
      clean = res.stdout.trim().length === 0;
    }
    items.push({
      label: '无未提交变更',
      ok: clean,
      detail: clean ? '工作区干净' : '存在未提交变更（先提交助手收尾）',
      required: true,
    });

    // 6) CHANGELOG present
    const changelogExists = await pathExists(join(root, 'CHANGELOG.md'));
    items.push({ label: 'CHANGELOG.md 就绪', ok: changelogExists, detail: changelogExists ? undefined : '发布时由 semantic-release 自动生成', required: true });

    // 7) metadata switches (advisory)
    const triggers: Record<string, boolean> = { ...(meta.workflow_triggers ?? {}) };
    items.push({
      label: '发布开关与 build_type=Release',
      ok: triggers.release === true && (meta.build_type ?? '') === 'Release',
      detail: `release=${triggers.release === true} · build_type=${meta.build_type ?? ''}`,
      required: false,
    });

    const total = items.filter((i) => i.ok !== undefined).length;
    const passed = items.filter((i) => i.ok === true).length;
    const allowRelease = items.filter((i) => i.required).every((i) => i.ok === true);
    return { projectName: currentProject.metadata.name ?? '', items, passed, total, allowRelease };
  };

  showPreflightPanel(context, {
    getState,
    runTests: async () => {
      await vscode.commands.executeCommand('het.test');
      const ok = lastBuildOk === true && lastTestSummary?.failed === 0 && (lastTestSummary?.passed ?? 0) > 0;
      return { ok, message: ok ? '构建与测试全绿。' : '构建或测试未全绿，请查看结果面板。' };
    },
    openQuality: async () => {
      await vscode.commands.executeCommand('het.quality');
    },
    openRelease: async () => {
      await vscode.commands.executeCommand('het.release');
    },
  });
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

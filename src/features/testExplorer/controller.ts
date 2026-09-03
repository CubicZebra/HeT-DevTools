import * as vscode from 'vscode';
import { readText } from '../../utils/fs';
import { parseGTestOutput, GTestRunSummary } from '../../core/gtestRunner';
import { parseTestDeclarations } from '../../core/testDiscovery';

/**
 * Test Explorer integration (development-plan T-2.6 / G-05 native view).
 * Discovers GTest cases from test_package/test/unit/*.cpp and drives real
 * runs through the same `conan create` pipeline as het.test.
 *
 * A run always executes the full build+test cycle (fcpp runs the whole unit
 * suite); per-case states are mapped back from the parsed gtest output.
 */

export interface TestExplorerDeps {
  projectRoot: () => string | undefined;
  /** Full build+test cycle; returns raw output (undefined = user already notified). */
  run: () => Promise<{ ok: boolean; stdout: string; stderr: string } | undefined>;
}

export function registerTestController(context: vscode.ExtensionContext, deps: TestExplorerDeps): void {
  const controller = vscode.tests.createTestController('hetTestController', 'HeT DevTools');
  context.subscriptions.push(controller);

  // file item id → per-TEST children keyed by suite.name
  const items = new Map<string, vscode.TestItem>();

  const clearTree = (): void => {
    for (const item of items.values()) {
      controller.items.delete(item.id);
    }
    items.clear();
  };

  const scan = async (): Promise<void> => {
    const root = deps.projectRoot();
    if (!root) {
      clearTree();
      return;
    }
    const { readdir } = await import('node:fs/promises');
    let names: string[] = [];
    try {
      names = await readdir(vscode.Uri.joinPath(vscode.Uri.file(root), 'test_package', 'test', 'unit').fsPath);
    } catch {
      clearTree();
      return;
    }

    // remove stale files
    const valid = new Set<string>();
    for (const f of names.filter((n) => n.endsWith('.cpp'))) {
      const key = root + '/' + f;
      valid.add(key);
      if (!items.has(key)) {
        const fileItem = controller.createTestItem(key, f, vscode.Uri.file(`${root}/test_package/test/unit/${f}`));
        fileItem.canResolveChildren = false;
        items.set(key, fileItem);
        controller.items.add(fileItem);
      }
    }
    for (const [key, item] of items) {
      if (!valid.has(key)) {
        controller.items.delete(item.id);
        items.delete(key);
      }
    }

    // (re)populate children per file
    for (const f of names.filter((n) => n.endsWith('.cpp'))) {
      const key = root + '/' + f;
      const fileItem = items.get(key);
      if (!fileItem) {
        continue;
      }
      let source = '';
      try {
        source = await readText(fileItem.uri!.fsPath);
      } catch {
        continue;
      }
      const keep = new Set<string>();
      for (const decl of parseTestDeclarations(source)) {
        const childId = `${decl.suite}.${decl.name}`;
        keep.add(childId);
        let child = fileItem.children.get(childId);
        if (!child) {
          child = controller.createTestItem(childId, decl.name, fileItem.uri);
          fileItem.children.add(child);
        }
      }
      fileItem.children.forEach((child) => {
        if (!keep.has(child.id)) {
          fileItem.children.delete(child.id);
        }
      });
    }
  };

  // discover on activation + project/file changes
  void scan();
  const watcher = vscode.workspace.createFileSystemWatcher('**/test_package/test/unit/*.cpp');
  watcher.onDidCreate(() => void scan());
  watcher.onDidChange(() => void scan());
  watcher.onDidDelete(() => void scan());
  context.subscriptions.push(watcher);

  const profile = controller.createRunProfile(
    '构建并运行（conan create）',
    vscode.TestRunProfileKind.Run,
    async (request: vscode.TestRunRequest, token: vscode.CancellationToken) => {
      const run = controller.createTestRun(request);
      // request.include may be undefined for a plain "run all"
      const targets: vscode.TestItem[] = request.include?.length ? [...request.include] : [...items.values()];
      for (const t of targets) {
        run.started(t);
      }
      const result = await deps.run();
      if (!result) {
        for (const t of targets) {
          run.failed(t, new vscode.TestMessage('无项目或运行被取消。'));
        }
        run.end();
        return;
      }
      const full = `${result.stdout}\n${result.stderr}`;
      const summary: GTestRunSummary = parseGTestOutput(full);
      const byKey = new Map(summary.tests.map((t) => [`${t.suite}.${t.name}`, t]));

      const mark = (t: vscode.TestItem): void => {
        if (token.isCancellationRequested) {
          return;
        }
        const hit = byKey.get(t.id);
        if (hit?.status === 'passed') {
          run.passed(t, hit.durationMs);
        } else if (hit?.status === 'skipped') {
          run.skipped(t);
        } else if (hit?.status === 'failed') {
          const msg = new vscode.TestMessage(hit.failureMessage ?? `测试失败（${t.id}）`);
          if (hit.failureFile && hit.failureLine) {
            msg.location = new vscode.Location(vscode.Uri.file(hit.failureFile), new vscode.Position(hit.failureLine - 1, 0));
          }
          run.failed(t, msg, hit.durationMs);
        } else if (!result.ok) {
          run.errored(t, new vscode.TestMessage('构建失败：请查看“问题”面板。'));
        } else {
          run.skipped(t);
        }
      };

      // mark leaves that were requested (children of a file request)
      const walk = (t: vscode.TestItem): void => {
        if (t.children.size === 0) {
          mark(t);
        } else {
          t.children.forEach((child) => walk(child));
          if (token.isCancellationRequested) {
            return;
          }
          if (result.ok) {
            run.passed(t);
          } else {
            run.errored(t, new vscode.TestMessage('构建失败：请查看“问题”面板。'));
          }
        }
      };
      for (const t of targets) {
        walk(t);
      }
      run.end();
    },
  );
  profile.supportsContinuousRun = false;
  context.subscriptions.push(profile);

  vscode.commands.registerCommand('het.refreshTests', () => void scan());
}

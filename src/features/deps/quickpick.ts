import * as vscode from 'vscode';
import { DepBucket } from '../../core/dependencyService';
import { CuratedEntry } from '../../data/conanIndex';

/**
 * V2-3 dependency search flow — native QuickPick, keyboard-first, offline-first.
 * Selecting a package (filterable list), then version / bucket / targets, then
 * a single confirm (the host commit handler owns the write + its modal).
 */

export interface DepCommitInput {
  conanName: string;
  version: string;
  bucket: DepBucket;
  targets?: string;
}

export interface DepQuickPickDeps {
  curated: CuratedEntry[];
  /** Candidate internal module names for the targets field ('' to skip). */
  modules: string[];
  /** Perform the dual-file write; returns a user-facing message. */
  commit: (input: DepCommitInput) => Promise<string>;
}

const BUCKETS: { id: DepBucket; label: string }[] = [
  { id: 'common', label: '公共 (common)' },
  { id: 'c', label: 'C (c)' },
  { id: 'cpp', label: 'C++ (cpp)' },
  { id: 'infra', label: '基础设施 (infra)' },
];

export async function runAddDependencyQuickPick(deps: DepQuickPickDeps): Promise<void> {
  // 1) pick a package (filterable) or enter one manually
  const manualItem: vscode.QuickPickItem = {
    label: '$(keyboard) 手动输入包名…',
    description: '不在内置索引中的 ConanCenter 包',
  };
  const entries: vscode.QuickPickItem[] = deps.curated.map((e) => ({
    label: e.conan,
    description: `建议 ${e.bucket} · ${e.versions.slice(0, 3).join(' / ')}`,
    detail: e.note,
  }));
  const picked = await vscode.window.showQuickPick([manualItem, ...entries], {
    placeHolder: '搜索 Conan 包（如 zlib / fmt / eigen）',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!picked) {
    return;
  }

  let conan = picked.label;
  let entry: CuratedEntry | undefined;
  if (picked === manualItem) {
    conan = (await vscode.window.showInputBox({ prompt: 'ConanCenter 包名', validateInput: (v) => (v && v.trim().length > 0 ? undefined : '必填') })) ?? '';
    if (!conan) {
      return;
    }
  } else {
    entry = deps.curated.find((e) => e.conan === conan);
  }

  // 2) version
  const version = await pickVersion(entry);
  if (version === undefined) {
    return;
  }

  // 3) bucket (pre-suggested from the index, still editable)
  const suggested = entry?.bucket ?? 'common';
  const bucketPick = await vscode.window.showQuickPick(
    BUCKETS.map((b) => ({ label: b.label, description: b.id === suggested ? '推荐' : undefined, id: b.id })),
    { placeHolder: `选择依赖桶（建议：${suggested}）` },
  );
  if (!bucketPick) {
    return;
  }
  const bucket = (bucketPick as { id?: DepBucket }).id ?? 'common';

  // 4) targets (optional, multi-select from discovered modules)
  let targets: string | undefined;
  if (deps.modules.length > 0) {
    const none: vscode.QuickPickItem = { label: '$(circle-slash) 不限定目标' };
    const qp = vscode.window.createQuickPick<vscode.QuickPickItem>();
    qp.title = '绑定到哪些内部模块（可多选）';
    qp.placeholder = '留空则作用于整个库';
    qp.canSelectMany = true;
    qp.items = [none, ...deps.modules.map((m) => ({ label: m }))];
    qp.selectedItems = [];
    const picked = await new Promise<string[] | undefined>((resolve) => {
      let settled = false;
      qp.onDidAccept(() => {
        settled = true;
        const chosen = qp.selectedItems.filter((x) => x.label !== none.label).map((x) => x.label);
        qp.hide();
        resolve(chosen);
      });
      qp.onDidHide(() => {
        if (!settled) {
          resolve(undefined);
        }
      });
    });
    qp.dispose();
    if (!picked) {
      return;
    }
    targets = picked.length > 0 ? picked.join(',') : undefined;
  }

  // 5) commit (the service shows its own confirm modal + dual-file write)
  const message = await deps.commit({ conanName: conan, version, bucket, targets });
  void vscode.window.showInformationMessage(message);
}

async function pickVersion(entry?: CuratedEntry): Promise<string | undefined> {
  if (!entry) {
    const v = await vscode.window.showInputBox({ prompt: '版本（如 1.2.3，可填 latest）', value: 'latest' });
    if (!v) {
      return undefined;
    }
    return v.trim();
  }
  const custom: vscode.QuickPickItem = { label: '$(edit) 自定义版本…' };
  const items: vscode.QuickPickItem[] = [
    ...entry.versions.map((v) => ({ label: v, description: v === entry!.versions[0] ? '推荐' : undefined })),
    custom,
  ];
  const picked = await vscode.window.showQuickPick(items, { placeHolder: `选择 ${entry.conan} 版本` });
  if (!picked) {
    return undefined;
  }
  if (picked === custom) {
    const v = await vscode.window.showInputBox({ prompt: '版本', value: entry.versions[0] });
    return v ? v.trim() : undefined;
  }
  return picked.label;
}

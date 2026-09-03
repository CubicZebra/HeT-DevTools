---
name: het-release
description: 'Release & versioning for the fcpp template (semantic-release + Conventional Commits). Use when: users ask to release / publish / bump version / changelog. 发布/发版：semantic-release 自动发版，版本号由提交前缀驱动。'
argument-hint: "Target version / notes (optional) / 目标版本/说明（可选）"
user-invocable: true
---

# S2 · het-release — Release / Versioning（发布新版本）

> Facts: `.github/skills/_shared/gitmoji.md`、`metadata-contract.md`、`.github/misc/.releaserc.json`。

## Mental Model（心智模型）

> "The template uses semantic-release: the **commit prefix (feat/fix/perf) decides the version jump**; on release it generates CHANGELOG.md, rewrites the `version` in metadata.json, and creates a GitHub Release. All you do is write well-formed commit messages."
> 模板用 semantic-release 自动发版：提交前缀决定版本号怎么跳，发布时自动生成 CHANGELOG、回写 metadata 版本、打 tag 发 Release。

## 3-Step Checklist（三步操作清单）

1. `metadata.json`: `build_type = "Release"`、`workflow_triggers.release = true`
2. Commit with proper prefixes（用规范前缀提交）:
   - `feat(...)` → minor（次版本 +1）
   - `fix(...)` / `perf(...)` → patch（修订版 +1）
   - `BREAKING CHANGE`（`feat(...)!:` or footer）→ major（主版本 +1）
3. Commit with `chore(:package:): ...` to trigger the release pipeline. 带 `(:package:):` 触发发布。

## Version Rules（版本号规则速查）

| Commit prefix（提交前缀） | Version change（版本变化） | Example |
|------|------|------|
| `feat` | minor +1 | 1.0.0 → 1.1.0 |
| `fix` / `perf` | patch +1 | 1.0.0 → 1.0.1 |
| `!` or `BREAKING CHANGE` | major +1 | 1.0.0 → 2.0.0 |

## Artifacts（产物）

- `CHANGELOG.md` (auto-generated)
- `metadata.json` `version` rewritten
- GitHub Release + tag

## Self-Help When Red（失败自救）

1. Actions → `Release` workflow → `Release` step log. 看 Release 日志。
2. Common: no conventional prefix (chore does not release) / build_type not Release / switch off. 常见：无规范前缀、build_type 非 Release、开关没开。
3. Needs `GITHUB_TOKEN` write permission. 需要写权限的 token。

> The legacy commit-base-versioning mechanism has been removed (2026-08); semantic-release is the only versioning path. 旧版 commit-base-versioning 已移除，semantic-release 是唯一版本机制。

## Related（关联）

- Auto commit → `het-commit` (N5); pre-release gate → `het-preflight` (N7). 自动提交用 N5，发版门禁用 N7。


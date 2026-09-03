---
name: het-commit
description: 'Auto Conventional Commit for the fcpp template (conventional + emoji superset, canonical form type(:emoji):). Use when: commit / conventional commit / split commits / auto commit. 自动规范提交：拆分改动并生成带正确 emoji 的规范提交。'
argument-hint: "Scope or note (optional) / 提交范围或说明"
user-invocable: true
---

# N5 · het-commit — Auto Conventional Commit（自动规范提交）

> For developers. Facts: `.github/skills/_shared/gitmoji.md`、`.github/workflows/metadata-controller.yml`。

## Mental Model（心智模型）

> "A commit message is **dual-channel**: the conventional prefix (feat/fix/...) drives versioning (semantic-release); the emoji drives which CI pipeline runs. This skill splits your changes into multiple well-formed commits and gets both channels right."
> 提交信息双通道：前缀决定版本号，emoji 决定 CI；本技能自动拆分并拼对两个通道。

## Workflow（先预览后执行）

1. **Analyze**: `git status` + `git diff` (staged or working tree). 分析改动。
2. **Classify**: map each file change to a conventional type. 分类。
3. **Split**: different types → separate commits (feat/fix/docs/test/ci apart). 拆分。
4. **Generate**: `<type>(<emoji>): <summary>` — **emoji in the parentheses after the commit word**, e.g. `test(:beer:): vector add cases`, `chore(:package:): prepare release`. 生成信息，emoji 放括号。
   - Soft rule: emoji anywhere in the message still triggers CI, but always use the canonical placement. 软性规则下任意位置可触发，但一律按规范放括号。
5. **Preview**: list every commit (type + files + message), **wait for confirmation**. 预览待确认。
6. **Execute**: `git commit` after confirmation (no push by default). 确认后提交，默认不 push。

## Type → Emoji Map（触发对应 CI）

| Change（改动内容） | Type | Emoji（trigger） |
|------|------|------|
| New feature (include/src) | feat | `:building_construction:` (build) |
| Fix | fix | `:building_construction:` (build) |
| Performance | perf | `:building_construction:` (build) |
| Test cases | test | `:beer:` (tests) |
| Docs/comments | docs | `:book:` (docs) |
| CI/infra | ci | `:shield:` (security scan) |
| Board/baremetal | feat/fix | `:fire:` (board build) |

> Rule: test→`:beer:`, docs→`:book:`, build-related→`:building_construction:` — one message, two channels. 一石二鸟。

## BREAKING CHANGE Detection（检测）

- Scan `include/` headers: signature/interface/param/return changes → breaking. 头文件签名变化判定。
- Output `feat(<emoji>)!: description` (e.g. `feat(:fire:)!: breaking API`) or add `BREAKING CHANGE:` in body → major. 决定主版本 +1。

## Versioning Note（版本机制约定）

- Unified **semantic-release**: `feat/fix/perf` prefixes are parsed → version bump → CHANGELOG + metadata version rewrite. 统一 semantic-release。
- commit-base-versioning has been removed (2026-08). 旧机制已移除。
- Release flow → `het-release` (S2).

## Guardrails（护栏）

- **Commit only by default; no push without explicit confirmation.** 默认只 commit 不 push。
- **Preview the split commits before executing.** 必须先给拆分预览。
- Do not touch unstaged content / rebase / amend history. 不碰未暂存、不 rebase/amend。
- `--dry-run` supported: only print the commit list. 支持 dry-run。

## Checklist（自检清单）

- [ ] Each commit has conventional prefix + correct emoji. 前缀 + emoji 正确。
- [ ] Different types split. 已拆分。
- [ ] Breaking annotated. breaking 已标注。
- [ ] Preview confirmed. 预览已确认。
- [ ] Not pushed (unless asked). 未 push。


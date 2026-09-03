# fcpp Skills System（技能体系）

> Library-level skills for the fcpp template — 16 `het-*` skills + 1 routing agent, invocable from VS Code Copilot Chat by typing `/`. 模板库级技能：16 个 `het-*` 技能 + 1 个路由 Agent，在 Copilot Chat 输入 `/` 即可调用。

## Directory（目录结构）

```text
.github/skills/
├── README.md                      # this index（本索引）
├── manifest.json                  # skill registry（注册清单，A1 路由用）
├── _shared/                       # shared fact sources（共享事实源，引用不复制）
│   ├── gitmoji.md                 # emoji trigger cheat sheet（触发速查）
│   ├── metadata-contract.md       # metadata.json contract（契约）
│   ├── code-conventions.md        # C/C++ code conventions（代码规范）
│   └── test-conventions.md        # testing conventions（测试规范）
├── het-guide/                     # S0 commander/onboarding（指挥官/入口）
├── het-build/                     # S1 build/test/coverage
├── het-release/                   # S2 release
├── het-docs/                      # S3 docs
├── het-quality/                   # S4 quality/security
├── het-board/                     # S5 cross-compile/board
├── het-fix-ci/                    # S6 troubleshooting
├── het-deps/                      # N1 dependency governance
├── het-module/                    # N2 add module/API
├── het-setup/                     # N3 environment setup
├── het-testgen/                   # N4 test generation
├── het-commit/                    # N5 auto conventional commit
├── het-audit/                     # N6 repository audit
├── het-preflight/                 # N7 pre-release gate
├── het-patent/                    # N8 patent mining / disclosure drafting
└── het-agent/                     # A1 routing agent
```

> Location: `.github/skills/<name>/SKILL.md` is the VS Code **project-level skill** location; all skills here are auto-discovered and loaded. 库级技能规范位置，自动识别加载。

## Slash Invocation（如何在 VS Code 用 / 直接调用）

All skills are `user-invocable: true` — type `/` in the Copilot Chat input to see and pick them. 输入 `/` 即可看到并选择。

| `/` command（命令） | Skill | What it does（作用） |
| --- | --- | --- |
| `/het-guide` | S0 | onboarding + routing + trigger cheat sheet |
| `/het-build` | S1 | build / test / coverage |
| `/het-release` | S2 | release a version |
| `/het-docs` | S3 | docs generation |
| `/het-quality` | S4 | quality / security gates |
| `/het-board` | S5 | cross-compile / on-board |
| `/het-fix-ci` | S6 | CI troubleshooting |
| `/het-deps` | N1 | dependency governance |
| `/het-module` | N2 | add module / API |
| `/het-setup` | N3 | environment setup |
| `/het-testgen` | N4 | test generation |
| `/het-commit` | N5 | auto conventional commit |
| `/het-audit` | N6 | repository audit |
| `/het-preflight` | N7 | pre-release gate |
| `/het-patent` | N8 | patent mining / disclosure drafting |
| `/het-agent` | A1 | autonomous routing agent |

Examples（用法示例）:

- `/het-audit` → run repository audit directly（说"审计"或 `/project-audit` 也会路由到它）.
- `/het-agent add etl tests and commit` → composes N4 + N5 automatically. 组合执行。
- No `/` + natural language → the model auto-loads the matching skill via `description`. 直接说自然语言也会自动加载。

## Two Families + One Agent（两大技能族 + 一个 Agent）

| Family（族） | Audience（面向） | Skills | Focus（定位） |
| --- | --- | --- | --- |
| IaC usage（一期） | CI/CD novices | S0~S6 | use the template IaC, just say what you want |
| Dev automation（二期） | developers | N1~N8 | daily dev automation: deps/module/setup/testgen/commit/audit/preflight/patent |
| Unified entry（统一入口） | all | A1 | natural-language skill composition |

## Usage Conventions（使用约定）

1. **Confirm writes（写操作需确认）**: read-only by default; file writes / push / release / delete need a plan + confirmation first. 默认只读，写操作先确认。
2. **Reference `_shared`, don't copy（引用 _shared 不复制）**: all fact standards come from `_shared/` to avoid drift. 避免口径漂移。
3. **Route first（路由优先）**: use `het-agent` (A1) when available; otherwise `het-guide` (S0) routing table. A1 优先，否则 S0 兜底。
4. **Frontmatter `description`** is the discovery surface — bilingual, keyword-rich. description 用中英关键词，保证意图命中。


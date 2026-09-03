# fcpp Private Gitmoji Trigger Superset — Cheat Sheet（私有 gitmoji 触发超集速查表）

> Fact source: emoji parsing in `.github/workflows/metadata-controller.yml`. All skills reference this table, never copy it. 所有技能引用本表，不复制。

## Trigger Table（触发表：提交信息带 emoji → 触发对应流水线）

| I want CI to...（我想让 CI 做什么） | Put in commit message（提交信息里写） | Trigger condition（触发条件） | metadata switch（开关） |
|------|------|------|------|
| Build（构建） | `:building_construction:` | push + `workflow_triggers.build=true` | `workflow_triggers.build` |
| Tests GTest+coverage（测试） | `:beer:` | push + `build_type=Debug` + `trigger_tests=true` + `workflow_triggers.tests=true` | `trigger_tests` / `activate_code_coverage` |
| Release（发布） | `(:package:):` | push + `build_type=Release` + `workflow_triggers.release=true` | `workflow_triggers.release` |
| Docs（文档） | `:book:` | push + `workflow_triggers.docs=true` | `workflow_triggers.docs` |
| Quality/security（质量/安全） | `:shield:` | push with emoji, or **any PR** (shift-left) + `workflow_triggers.security_scan=true` | `workflow_triggers.security_scan` |
| hetai cross-compile/board（上板） | `:fire:` (or `🔥`) | push（`hetai-package-matrix.yml` separate check） | self-hosted, no switch |

## General Rules（通用规则）

- **Soft rule（软性规则）**: an emoji anywhere in the message is grep-matched (`grep -q`) — even in the description it triggers. emoji 出现在任意位置即可触发。
- **Canonical form（规范写法，推荐）**: emoji in the **parentheses right after the commit word**（放在主 commit 词后的括号里）:
  `<type>(<emoji>): <description>`
  e.g. `feat(:fire:): cross-compile support`, `test(:beer:): vector add cases`, `chore(:package:): prepare release`.
- Versioning is driven by `commit-analyzer` (semantic-release) reading the **conventional prefix** (feat/fix/...), orthogonal to the emoji. 版本由 conventional 前缀决定，与 emoji 正交。

## Conventional Type → Emoji Map（类型 → emoji 映射，`het-commit` N5 使用）

| Type（类型） | Purpose（用途） | Suggested emoji（建议 emoji） |
|------|------|------|
| feat | new feature | ✨ (add `:building_construction:`/`:fire:` if you need that pipeline) |
| fix | fix | 🐛 |
| perf | performance | ⚡ |
| docs | docs | 📖（trigger `:book:` semantics with `:book:`） |
| test | tests | 🧪（trigger tests with `:beer:`） |
| build | build | 🏗️（trigger build with `:building_construction:`） |
| ci | CI config | 🔧 |
| refactor | refactor | ♻️ |
| style | style | 🎨 |
| chore | misc | 🔩 |

## BREAKING CHANGE Syntax（语法）

- Form 1（方式一）: `<type>(<emoji>)!: description`, e.g. `feat(:fire:)!: breaking API`. 
- Form 2（方式二）: body contains `BREAKING CHANGE: description`.
- Both → major version by `commit-analyzer`. 判定为主版本 +1。


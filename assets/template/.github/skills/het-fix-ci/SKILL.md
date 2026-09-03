---
name: het-fix-ci
description: 'CI/CD troubleshooting for the fcpp template. Use when: CI is red / workflow failed / build or test fails / unknown where the problem is. CI 排障：定位并修复模板流水线常见失败。'
argument-hint: "Failure link or symptom / 失败链接或症状"
user-invocable: true
---

# S6 · het-fix-ci — CI Troubleshooting（CI 排障）

> For CI/CD novices: locate the failure by pipeline, don't guess. 按流水线定位失败，不要瞎猜。

## 3-Step Locate（三步定位法）

1. **Actions page**: GitHub → Actions → red workflow → red job → failing step log. 看 Actions 页定位红 job 与步骤。
2. **Match symptom** with the failure signature table below. 对号入座。
3. **Fix & rerun**: push again or `Re-run failed jobs`. 修复后重跑。

## Failure Signature Table（各流水线失败签名表）

### Build / Tests（构建/测试）
| Symptom（症状） | Cause（原因） | Fix（修复） |
|------|------|------|
| `conan create` timeout | deps compile too slow (55 min) | raise timeout / pre-cache |
| deps not found | network / bad version | check `conandata.yml` / `--build=missing` |
| Windows build odd | shared forced to static | expected, not an error |
| coverage artifact missing | switches off | turn on `trigger_tests`/`activate_code_coverage` |

### Release（发布）
| Symptom | Cause | Fix |
|------|------|------|
| version not bumped | no conventional prefix | use `feat/fix/perf` |
| not triggered | build_type != Release or switch off | fix metadata |

### Docs（文档）
| Symptom | Cause | Fix |
|------|------|------|
| missing deps | doxygen/graphviz not installed | run `python ./docs/build.py` locally |
| language missing | tag not in `doc_languages` | check `[en]`/`[zh]` |

### Quality / Security（质量/安全）
| Symptom | Cause | Fix |
|------|------|------|
| format red | clang-format violation | `clang-format -i` |
| clang-tidy warning | WarningsAsErrors | fix code |
| secret alert | secret committed | check gitleaks report |

### Board（上板）
| Symptom | Cause | Fix |
|------|------|------|
| baremetal build fails | dep not in `baremetal_white_list` | adjust whitelist |
| flash fails | flash_tool / device wrong | check `bench_config.json` |
| not triggered | needs self-hosted runner | check runner |

## General Checklist（通用排查清单）

1. **gitmoji not triggered**: emoji spelling? Use canonical `type(:emoji:): description`（emoji 放括号）；`workflow_triggers.*` = true?
2. **Switches off**: `workflow_triggers` all false → turn on first. 开关没开。
3. **Artifacts not found**: download from the bottom **Artifacts** area. 产物在 Actions 页底部 Artifacts。
4. **Reproduce locally**: `conan create . -s build_type=Debug --build=missing` is faster than CI. 本地复现更快。

## Route to Specific Skills（定位后转交）

- Build/test → `het-build` (S1); release → `het-release` (S2); docs → `het-docs` (S3); quality → `het-quality` (S4); board → `het-board` (S5).


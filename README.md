<div align="center">

# HeT DevTools

**把基于 [fcpp](https://github.com/HeT-FTI/fcpp) 的 C/C++ 工程保障变成“按一下就懂”的驾驶舱。**

> 只需写 `include/` 与 `src/`，剩下的构建、测试、依赖、文档、质量、提交、发布、上板交给它。

A plain-language engineering cockpit for fcpp-based C/C++ libraries: build, test, dependencies, docs, quality gates, release & board benchmarks — one click each.

![VS Code >= 1.95](https://img.shields.io/badge/VS%20Code-%3E%3D1.95-blue) ![Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-green)

</div>

---

## 为什么用

fcpp 模板用 Conan / CMake / CI / Doxygen / semantic-release 把工程保障做成了“基础设施即代码”。但对只想写 C/C++ 的开发者来说，每个术语都是一道门槛。HeT DevTools 把这些术语全部变成**无脑按钮**：

- **构建** = `conan create`（错误自动映射到“问题”面板）
- **加依赖** = 四桶可视化，`conandata.yml` + `metadata.json` 双写（预览→确认→可撤销）
- **出文档** = `docs/build.py` 一键，Doxygen+Sphinx 双语多版本
- **质量门禁** = 本地绿 = CI 绿（clang-format / clang-tidy / schema / commitlint / gitleaks）
- **提交** = `type(:emoji:):` 双通道（type 定版本号、emoji 触发 CI）
- **发版/Preflight** = 与 GitHub Actions 门禁一一对应
- **上板** = Benchmark 面板（无硬件也可用 `--no-flash` + 模拟输出解析）

## 5 分钟快速开始

1. 安装 VS Code ≥ 1.95，并准备 fcpp 开发环境：`python`、`conan`、C/C++ 编译器（conda 或手动均可）。
2. 打开一个含 `metadata.json` 的 fcpp 项目（模板生成或自建均可）——扩展自动激活。
3. 命令面板（`Ctrl+Shift+P`）→ `HeT DevTools: 打开驾驶舱`。
4. 依次点：`构建并测试` → `覆盖率视图` → `文档中心`。
5. 想从零开始？`HeT DevTools: 从模板初始化新项目`（版本锁定、离线可用本地源）。

> 所有“写文件”操作都遵循 **预览 → 确认 → 写回（.bak 备份）**，扩展绝不自动改动 `include/` / `src/` / `conanfile.py`。

## 命令一览

| 命令 | 用途 |
|------|------|
| `HeT DevTools: 打开驾驶舱` | 健康分 / 环境 / 快捷动作 |
| `HeT DevTools: 构建项目` / `构建并测试` | `conan create`，诊断映射问题面板 |
| `HeT DevTools: 依赖管理器` | 四桶依赖增删（conandata + metadata 双写） |
| `HeT DevTools: 新增模块` | 成对文件骨架（导入标记/双语注释/@exporter） |
| `HeT DevTools: 生成测试` | 模式 A 代码驱动 / 模式 B 蓝图先行（测试先行） |
| `HeT DevTools: 覆盖率视图` | `activate_code_coverage` 引导 + 报告定位打开 |
| `HeT DevTools: 文档中心` | Doxygen+Sphinx 一键（含 graphviz 本机修正） |
| `HeT DevTools: 质量与安全` | format / tidy / schema / commitlint / gitleaks / MegaLinter |
| `HeT DevTools: 提交助手` | 双通道规范提交，commitlint 预检，推送需确认 |
| `HeT DevTools: 发布中心` / `发布前检查` | 📦 发版引导与 Preflight |
| `HeT DevTools: 上板测试` | Benchmark：`--no-flash` 构建 / 模拟输出解析 |
| `HeT DevTools: CI 状态` | GitHub Actions（离线降级为本地工作流清单） |
| `HeT DevTools: 审计报告` | 10 节 Markdown → `workspace/audit-report.md`（可 `@workspace` 引用） |
| `HeT DevTools: 从模板初始化新项目` / `检查模板更新` | G-21 / G-22（只读对比 + 同步计划） |
| `@het`（Chat） | 意图路由到对应面板 |

## 隐私与遥测（T-5.2）

- 遥测**默认关闭**（`het.telemetry.enabled`）。
- 开启后仅在本机 `workspaceState` 记录激活/功能使用次数；**本版本不发送任何数据、不含代码与个人数据**（无 PII），并可随时关闭。
- GitHub 登录复用 VS Code 内置认证（D-9）：凭证由 VS Code 托管，扩展不落地、不存储任何密钥。

## 开发

```powershell
conda activate build   # 本机 node/npm 位于 build 环境
npm install
npm run check          # tsc --noEmit
npm run compile        # esbuild → out/extension.js
npm test               # 单元测试（mocha）
npm run test:c1..c4    # 各阶段端到端（C1~C4，离线可用）
npm run package        # vsce package → .vsix（本地 dry-run）
```

按 F5 启动 Extension Development Host；打开含 `metadata.json` 的 fcpp 项目即可触发激活。

> 设计与草图：`workspace/develope/development-plan.md`、`gui-sketches.md`；阶段收尾：`phase1~4-closeout.md`（均为开发文档，不入包）。

## License

Apache-2.0

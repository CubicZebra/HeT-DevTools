# Changelog

All notable changes follow [Conventional Commits](https://www.conventionalcommits.org/) + fcpp emoji superset.

## [0.3.0] - 2026-09-07

### Added

- **悬停小卡片控制台（V5-2）**：chip 悬停升级为可交互「项目/状态」七行闭环（开发环境 / 构建结果 / 测试中心 / 技术文档 / 代码覆盖 / 模板同步 / 工程健康——四字标签、总括置后）；每行带 `command:` 链接（Copilot 同款，悬停常驻、点击即执行、移出即消失）；技术文档行成功后刷出 `[Doxygen] [Sphinx]` 产物入口、失败可跳文档中心；工程健康行极简显示（分数/判定/项数 + `[体检]`/`[明细]`），可提升标签以独立 hint 行呈现避免撑破表格。
- **健康维度细化（电脑管家式体检）**：体检缓存扩为完整 report；新增判定词与 ≤3 可提升标签（fail→warn→权重排序）；`het.healthReport` 体检明细面板（12 项得分/颜色/建议 + 重新体检）。
- **环境展示对齐新设计语言（V5-2B）**：总览页移除旧 generic 嗅探明细/运行时行/工具 chips，只展示 Provider 决策 → 托管环境 → WSL/macOS 车道 → 手动覆盖（仅非空 `het.tools`）；新增单一环境样本（`envSample`），体检 conan 判据接车道事实。
- **metadata 人类可读 + 无 .bak（V5-3）**：`metadata.json` 写回全部手术式（只动被改字段、保留 fcpp 原排版，新项目即模板原样 + 手术改写）；fcpp 风格序列化器兜底；全链路不再产生 `.bak`。
- **文档环境闭环（V5-4）**：Windows + managed 文档构建全程走 WSL2 车道（venv `numpy/sphinx/sphinx-intl/sphinx-rtd-theme` + 免密 root apt 自愈 `doxygen/graphviz/make`，不碰发行版 conda 环境）；车道就绪自动手术式覆写 `graphviz_bin=/usr/bin`。
- **文档产物入口（V5-5）**：文档面板 Doxygen/Sphinx 分开按钮（无产物灰、成功点亮，默认浏览器打开）；构建成功 toast 带「打开 Sphinx/Doxygen 文档」动作；悬停卡文档行同源。

## [0.2.0] - 2026-09-07

### Added

- **构建执行接入环境车道（V5-1，治本 all-in-one）**：`managed` 语义项目在 Windows 上自动经 **WSL2 托管车道**构建——Linux 同语义（gcc-13 + gcov/lcov）、与发行版内的 conda base / FEniCS 等环境完全隔离。
  - 车道自举（幂等）：`~/.het-fti/managed-env` 下私有 venv（conan/cmake/ninja）+ 私有 `CONAN_HOME` + **生成式**（绝不探测）Conan 2 profile（gcc 13 / libstdc++11 / cppstd 17 + `tools.build:compiler_executables` 钉死 gcc-13/g++-13）。
  - 自愈：发行版缺 `python3-venv` 时经 WSL 免密 root 一次性 `apt-get install python3-venv` 后重试；缺 gcc-13/lcov 时给出可执行指引。
  - 脚本一律以文件方式执行（`wsl.exe … -- bash <file>`），绕开 wsl.exe 对多行 argv 脚本的破坏；诊断路径 `/mnt/<drive>/…` 自动映射回 Windows 供“问题”面板跳转。
  - 修复潜伏缺陷：`wsl -l -q` 的 **UTF-16LE 输出解码**（此前发行版名是 NUL 垃圾）；`managedProfile` 由 Conan 1 的 `[env]` 改为 Conan 2 的 `[conf] tools.build:compiler_executables` 并补 `compiler.cppstd`。
  - 无 WSL 发行版时给出明确指引（不再静默回落到不可用的 MSVC 默认 profile）；`toolchain: system` 保持原样（本机工具链兼容模式）。

## [0.1.1] - 2026-09-07

### Added

- **环境初始化器（V4）**：宿主能力探测（Linux/macOS/WSL2/MinGW/MSVC）、托管环境 managed-env（Python venv + conan/cmake/ninja + CONAN_HOME + 标记文件）、WSL2 车道（含托管发行版引导）、macOS 车道（CLT + llvm-cov）、环境页（准备/移除按钮）。
- **监控卡（V4-6）**：HUD 总览（状态卡 + 10 快捷动作 + 1-9 键盘）、状态栏芯片两栏表格 tooltip + gitmoji 徽标条、Snooze / 隐藏 HUD。
- **零人工验收矩阵（V4-7）**：`verify-installed` 四阶段（empty/proj/matrix/scrub）+ 心跳看门狗 + 零通知宿主。
- **卸载语义（V4-8）**：激活时托管环境 GC、项目工具链 `managed|system` 标记、新项目默认 managed、`het.envGc` / `het.envRemove` 命令。

### Fixed

- 版本号 0.1.0 → 0.1.1：修复同版本覆盖安装不生效（VS Code 不更新同版本扩展）导致旧版 UI/环境页残留的问题。

## [0.1.0] - 2026-09-03

### Added

- **工程脚手架（Phase 0）**：TypeScript strict + esbuild 单文件打包、ESLint、Mocha、`@vscode/test-electron` 集成宿主、`.vsix` 本地打包、Marketplace 元数据、GitHub 身份服务（三层降级）、模板来源服务（TEMPLATE_REF 锁定）。
- **核心闭环（Phase 1）**：fcpp 项目三级探测、工具链检测、欢迎页、状态栏、构建（`conan create` + 诊断映射）、GTest/CTest 输出解析、测试结果视图、驾驶舱（健康评分）、真实 fcpp 端到端 C1（构建+5 测试通过）。
- **开发者自动化（Phase 2）**：metadataService（校验/diff/.bak 写回）、元数据设置编辑器 G-17、依赖管理器 G-07（conandata+metadata 双写、四桶约束）、新增模块向导 G-08、测试生成模式 A G-09、TestController 测试浏览器、覆盖率视图 G-06、C2 端到端。
- **蓝图驱动测试生成（T-2.8）**：模式 B——从 PRD/PlantUML 提取契约 → GTest 契约 + 实现计划（落 `/workspace/`）。
- **文档 / 质量 / 提交 / 发布（Phase 3）**：文档中心 G-10（含 D-10 graphviz 本机修正）、质量门禁 G-11（format/tidy/schema/commitlint/gitleaks + MegaLinter 降级）、提交助手 G-16（双通道）、发布中心 G-12、Preflight G-13、C3 端到端。
- **Benchmark / CI / 审计 / 初始化（Phase 4）**：上板面板 G-14（`--no-flash` + 协议解析）、CI 状态 G-19（离线降级）、审计报告 G-03 完整版（`workspace/audit-report.md`）、专利向导 G-20、`@het` Chat 桥接、模板初始化 G-21、模板更新检查（只读 + 同步计划）、C4 端到端（离线全链路）。
- **打磨（Phase 5）**：`package.nls` 双语（命令/配置/市场文案）、运行时状态栏双语、本地可选遥测（默认关、无外发）、激活计时与 metadata/conandata 节流监听、OS×VS Code CI 矩阵、市场页 README。

### Fixed

- MSVC/GBK 下生成文件的代码字符串保持纯 ASCII（D-11）。
- pybind11 位于 infra 桶时不要求 `enable_python_bindings`（仅主包桶受限）。
- 异步命令注册不再被 `void` 包装吞掉返回值（`executeCommand` 可 await）。

### Security

- 无凭证落地：GitHub 认证复用 VS Code 内置会话 / gh CLI / 匿名降级。
- 遥测默认关闭且本版本不外发任何数据。

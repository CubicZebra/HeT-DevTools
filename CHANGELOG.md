# Changelog

All notable changes follow [Conventional Commits](https://www.conventionalcommits.org/) + fcpp emoji superset.

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

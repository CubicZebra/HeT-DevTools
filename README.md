# HeT DevTools

把 fcpp 模板的 IaC 保障变成按钮：**只写 include/src，剩下的交给它。**

面向使用 [fcpp](https://github.com/HeT-FTI/fcpp) C/C++ 库模板的开发者。构建、测试、覆盖率、
依赖治理、文档（Doxygen+Sphinx 双语）、质量门禁、规范提交、发版与上板 Benchmark 全部以白话界面呈现，
无需理解 Conan / CMake / CI / Doxygen 等术语。

> 开发状态：Phase 0（工程脚手架）进行中。规划详见 `workspace/develope/development-plan.md` 与
> `workspace/develope/gui-sketches.md`。

## 要求

- VS Code ≥ 1.95
- 开发/使用 fcpp 项目环境：Python + Conan（由 conda/pip 提供）、MSVC/GCC/Clang

## 开发

```powershell
conda activate build   # 本机 node/npm 位于 build 环境
npm install
npm run check          # tsc --noEmit
npm run compile        # esbuild → out/extension.js
npm test               # 单元测试（mocha）
npm run package        # vsce package → .vsix
```

按 F5 启动 Extension Development Host 进行调试；打开一个 fcpp 项目（含 `metadata.json`）即可触发激活。

## License

Apache-2.0

# Doxygen Domain Guide（Doxygen 领域指南）

> Loaded on demand when the task involves code annotations / Doxygen. 涉及代码注解/Doxygen 时按需加载。
> Facts: `.github/skills/_shared/code-conventions.md`（注解规范）、`Doxyfile`、`docs/doxygen/dox/`。

## Annotation Tags（注释标签速查）

| You want（你想） | Write（写法） |
|------|------|
| English comment | `@brief [en] ...` |
| Chinese comment | `@brief [zh] ...` |
| Version filter | `@since 1.0` |
| Export to C++ module | `@exporter` |
| Attach to module | `@attacher` |
| Main-page bilingual section | `@section intro_sec [en] ...` / `@section intro_sec [zh] ...` |

Example from the template（模板实例，`src/ctest.c`）:
```c
/**
 * @brief [en] the C function
 * @brief [zh] 测试用C函数
 * @exporter
 */
void test_c_compiler();
```

## Language / Version Filtering（语言与版本过滤）

- `docs/build.py` filters comments by `[en]`/`[zh]` tags → one Doxygen build per active language（`doc_languages`）. 按语言标签过滤生成多语言。
- `@since <version>` filters objects per doc version（`doc_versions`）; objects with `@since <= target` are kept. 按 @since 版本过滤。
- Main page: `docs/doxygen/dox/mainpage.dox` uses `@section xxx [en] ... / [zh] ...`. 主页双语章节写法。

## Module Visibility（模块可见性）

- `@exporter`: export the symbol into the generated C++ module. 导出符号。
- `@attacher`: attach without forcing export. 附加符号。
- Must be inside a **multi-line Doxygen comment**; global objects separated by **2 blank lines**. 必须在多行 Doxygen 注释内；全局对象间 2 空行。
- Full spec: `.github/skills/_shared/code-conventions.md`.

## Doxyfile Notes（Doxyfile 关键点）

- `doc_doxygen_folders` / `doc_doxygen_suffix` in metadata drive what Doxygen scans. metadata 驱动扫描范围与后缀。
- Images: `docs/images/` with `IN:`/`OUT:`/`ALL:` prefix routing (see `docs/build.py`). 图片按 IN/OUT/ALL 前缀路由。

## Pitfalls（易踩坑）

1. Tag typo: must be exactly `[en]`/`[zh]` and the language must be in `doc_languages`. 标签拼写或语言未启用。
2. `@exporter` outside a multi-line Doxygen comment → module silently not generated. 注解位置不对 → 模块静默失败。
3. New API without `@since` → not shown in earlier doc versions. 新 API 缺 @since 不会出现在旧版本文档。
4. Iterate with `python ./docs/build.py` locally, faster than CI. 本地迭代更快。


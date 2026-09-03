# metadata.json Contract（契约：单一驱动源）

> fcpp drives everything from `metadata.json`: CMake, main recipe, test_package and CI controller all read it. Before changing any field, confirm all consumers stay consistent. 修改任何字段前必须确认所有消费方行为一致。

## Fields & Consumers（字段与消费方）

### Basics（基础信息）
| Field（字段） | Consumers（消费方） | Note（说明） |
|------|------|------|
| `name` | all | package name → target prefix, package ref |
| `version` | all | rewritten by semantic-release |
| `target` | CMake/package | `auto` = `${name}::${name}` |
| `build_cppstd` / `build_cstd` | CMake/recipe | C++17/20/23, C11; `configure()` falls back to 17 |
| `build_type` | CI controller | Debug/Release affects test/release triggers |
| `is_shared` / `is_header` | CMake | shared forced to static on Windows |
| `generate_modules_inplace` | recipe | auto-generate .ixx/.cppm modules |
| `std_modules` / `user_modules` | recipe | import conversion |

### Dependency Contract（依赖契约，最关键）
```json
"dependencies": {
  "common": {"<pkg>": ["<CMake target>"]},   // shared by C/C++ targets（双目标共享）
  "c":      {"<pkg>": ["<CMake target>"]},   // C target only
  "cpp":    {"<pkg>": ["<CMake target>"]},   // C++ target only
  "infra":  {"<pkg>": ["<CMake target>"]}    // host-side infra (GTest / pybind11)
}
```

**Semantic rules（不可违背）**
1. **One package in one bucket only**; `common` = shared by both targets. 一个包只放一个桶。
2. **GTest belongs to test_package only** (host-side desktop verification), never in the main package's component requires. GTest 只归 test_package。
3. **pybind11 enters the main package only when `enable_python_bindings=true`** (gated in both main recipe and test_package). pybind11 跟随开关。
4. Keys differ in case from conandata package names (`Eigen3` vs `eigen`) — always compare lowercase. 键名与 conandata 包名大小写不同，统一小写归一。

### Switches（开关）
| Field（字段） | Purpose（作用） |
|------|------|
| `trigger_tests` | run GTest (CI + test_package) |
| `activate_code_coverage` | coverage (lcov + genhtml) |
| `saving_tests_log` | save test log |
| `enable_python_bindings` | build pybind11 module |
| `workflow_triggers.*` | CI master switches (build/tests/release/docs/security_scan); **all false = gitmoji triggers nothing** |
| `baremetal_white_list` | baremetal cross-compile whitelist (default `["etl","ArduinoJson"]`); applied in both deps & requirements |

### Docs（文档）
| Field | Purpose |
|------|------|
| `doc_languages` / `doc_versions` | docs/build.py multi-language/version |
| `doc_doxygen_folders` / `doc_doxygen_suffix` | Doxygen scan scope |

## Common Mistakes（易错点）

1. Adding GTest to `dependencies.cpp` → pollutes downstream (benchmark). 污染下游。
2. Reading a metadata key from `self.conandata` (wrong source) → `None` crash; use `self.meta`. 读错数据源会崩。
3. `workflow_triggers.*` all false but expecting CI → turn on first. 开关全关却期望触发。
4. Whitelist case mismatch (`Eigen3` vs `eigen`) → normalize lowercase. 大小写统一小写。


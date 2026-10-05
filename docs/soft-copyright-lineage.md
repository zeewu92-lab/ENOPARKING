# 软件著作权代码连续性记录

## 来源基线

Core source baseline: zeewu92-lab/Eng-nocrazy main at migration snapshot.

New repository: zeewu92-lab/ENOPARKING

## 保留的核心代码域

- src/features/learning/algorithm.js
- src/features/learning/learningState.js
- src/features/learning/useLearningSession.js
- simulator/
- src/data/gaokao-3500.json
- src/data/gaokao-frequency.json
- src/data/pep-2019-*.json
- src/utils/seedLedger.js
- src/utils/gardenState.js
- src/utils/learningStats.js
- src/utils/wrongBook.js
- src/api/vocab.js
- src/api/account.js
- server/auth.js
- server/db.js

这些文件作为稳定功能基线迁移，后续修改应尽量通过新增模块、明确接口或完整重构提交进行，不在同一核心文件上形成无法追踪的连续补丁。

## 后续提交规则

1. 算法规则变更必须单独提交并记录原因。
2. Scheduler、Mastery、Stability、VerificationSelector 不与视觉改版混合提交。
3. Learning Event 数据结构变更必须同步更新回放逻辑和测试。
4. Seed Ledger 与 Garden 的变更不得隐式修改学习算法。
5. 词库数据更新必须独立于 UI 改版提交。
6. 软著材料所需的源代码版本应从明确的 release commit 导出。

# ENOPARKING 架构基线

## 产品身份

- English repository identifier: ENOPARKING
- Chinese product name: 语未央
- Internal legacy repository: Eng-nocrazy

## 核心连续性

Vocabulary → Learning Source → Learning Session → Learning Event → Learning Algorithm → Learning Stats → Seed Ledger → Garden

### 学习算法边界

1. VerificationSelector 决定当前单词的验证方式。
2. EventProcessor 处理正确、错误与提示等级。
3. MasteryCalculator 计算掌握状态。
4. StabilityEngine 维护稳定性状态。
5. Scheduler 计算下一次复习日。
6. LearningState 以 Learning Event 为唯一学习状态事实来源，并通过算法回放恢复单词状态。
7. LearningSession 负责一次用户学习会话，不直接修改算法内部规则。

### Garden 隔离原则

Garden 只消费有效学习事件产生的 Seed。

Learning → Seed Ledger → Garden

Garden 不反向修改 Scheduler、Mastery、Stability 或 Learning Event。

## 365 天模拟器冻结基线

- words = 900
- window = 365 days
- newTarget = 5
- reviewCap = 20
- dailyMax = 30
- eventMultiplier = 1.00
- Model C = fixed / 0.4 / 0.6
- Scheduler = v1.0 fixed
- Error Penalty = v1.0
- error episode = v1.0
- stability floor = 0
- hash = FNV-1a 32-bit
- wordId = w1 ~ w900
- error rates = 0% / 5% / 10% / 15% / 20% / 30%

模拟器只作为 Scheduler 与算法验证夹具，不直接参与 Garden 运行时。

## 迁移原则

- 核心算法源码保持原样迁移，避免在新仓库中重新发明同一套逻辑。
- 词库数据完整保留现有教材与高考 3500 数据。
- Account、Vocab、Friends、Wrong Book、Learning Stats、Seed Ledger、Garden State 等正常使用能力保留。
- 新仓库重新建立 UI 入口与产品壳层，避免继续在旧 App.jsx 上堆补丁。
- 不恢复旧仓库中已经淘汰的复杂页面作为运行时依赖。
- 不加入 vercel.json，保持 Vercel 默认项目配置。

## 软著连续性原则

算法、事件模型、词库处理、复习调度与 Seed Ledger 等核心代码保留稳定版本的文件边界、函数边界和数据流。后续 UI 重建应通过明确的 feature 层调用核心模块，避免把核心算法重新嵌入页面组件。

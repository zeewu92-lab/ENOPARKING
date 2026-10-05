# Eng-nocrazy Learning Simulator

此目錄是與產品執行邏輯隔離的 deterministic 規格 simulator。

執行：
node simulator/verify.js

eventMultiplier 可設為 1.00、1.20、1.25，預設 1.00。倍率只作用於 evidenceStrength，尚未進行產品校準。

目前固定：
Model C、coverage、錯誤扣分 C、episode s0、same-context diminishing 1.0/0.5/0.25/0、EVIDENCE_SCALE=10、recoveryProgress、requiredRecovery、scheduler-v1.0，以及 deterministic tie-break。

本 simulator 是規格驗證工具，不取代產品學習引擎。
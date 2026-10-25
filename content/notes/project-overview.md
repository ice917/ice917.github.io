---
title: "项目全景：这条流水线在算什么"
date: 2026-10-25
draft: false
tags: ["总览", "方法"]
description: "从一张 50×50 的温度场，到一棵 400 节点的树，再到一次「打平但更费泵」的比较。"
---

一句话：**在 50×50 的网格上，让一条通道网络按温度场自己长出来，看它能不能打赢直通道。**

## 五步流水线

`heat_tree.py` 的 `main()` 就是全部流程，Step 1 到 Step 5 一一对应：

| 步骤 | 做什么 | 代码位置 |
| --- | --- | --- |
| Step 1 | 解稳态导热，得到温度场 `T` | `field.py` |
| Step 2 | 从最热的格子开始，贪心地把邻居吸进树 | `grow.py` |
| Step 3 | 按 Murray 定律给每条边分配半径 | `radius.py` |
| Step 4 | 把树导成 STL，并做流形检查 | `mesh.py` |
| Step 5 | 用等占据格数的直通道做对照，比较温度与压降 | `verify.py` |

Step 5 之后把结果写进 `outputs/run_report.json`。**这个 JSON 是整个项目唯一的证据台账**——后面所有笔记里的数字，都优先从这里引用。

## 代码规模（用 `(Get-Content $f).Count` 数出来的）

| 文件 | 行数 | 职责 |
| --- | ---: | --- |
| `field.py` | 468 | 温度场求解、源区掩膜、归一化、sanity check |
| `grow.py` | 124 | 贪心生长、度分布、形状签名 |
| `radius.py` | 105 | 下游需求流量、Murray 半径、一致性检查 |
| `mesh.py` | 188 | 圆柱三角面、STL 导出、流形报告 |
| `heat_tree.py` | 237 | 编排（就是这五步） |
| **主线合计** | **1,122** | |
| `verify.py` | 932 | 对照组构造与比较（单独计） |

注意 `Measure-Object -Line` 会漏掉空行（主线会数成 403/100/86/165/207），要报行数就用 `(Get-Content).Count`。

## 这次的实测结论

`run_report.json` 的 `compare` 段：

- 树：`T_max_C = 27.596`，`T_mean_solid_C = 25.02`，`hotspot_area_mm2 = 25.0`，`pressure_drop = 7.3472`
- 直通道：前三项**完全相同**，`pressure_drop = 0.0237`
- `dp_ratio_tree_over_straight = 310.17`
- `verdict`：「tied on T_max, tied on mean solid T, tied on hot zone, higher pressure drop」

也就是说：在当前这套公平基准下，树**没有热学优势，只有水力劣势**。

这不是「树没用」的结论，而是「这个比较方式下树没用」的结论——两者差别很大，见 [公平比较的三级基准](/notes/fairness-basis/)。另外 `pressure_drop` 是无量纲的 `poiseuille_dp` 输出，不是 kPa，千万别当物理压降引用（见 [FM-2 压降口径](/notes/fm-2-dp/)）。

## 三个必须先知道的前提

1. **温度是相对的。** 主流程输出的 `T` 经过 `normalize_field` 仿射缩放到峰值 100 °C，所以 27.596 °C 是「这个无量纲装置」里的读数，不是真实芯片温度。见 [温度场](/notes/thermal-field/)。
2. **格距有两把尺子。** `PITCH_MM = 1.0` 是求解器的定义常数，`grid_mm = 0.9` 才是映射到 45 mm 封装的那把。见 [两把尺子](/notes/two-calibers/)。
3. **树是长出来的，不是优化出来的。** 它没有目标函数，没有回溯，只是在追温度梯度。见 [热驱动贪心生长](/notes/greedy-growth/)。

下一步建议读 [阅读顺序](/notes/reading-order/)，或者直接跳到 [FM-7 框架盲区](/notes/fm-7-blindspot/) 看看这套验证最容易骗自己的地方。

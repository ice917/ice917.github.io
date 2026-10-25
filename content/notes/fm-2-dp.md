---
title: "FM-2 压降口径：树不是串联管"
date: 2026-10-25
draft: false
tags: ["失效模式", "验证"]
description: "399 条边不能求和。树是单入口多出口网络，压降是「一条根到叶路径」的压降，不是全树累加。"
---

## 形态

压降公式本身没错，错在**把公式套到了错误的拓扑上**。

对一条串联管，`Δp = Σ 8μLQ/(πr⁴)` 是对的：每一段的流量在段末被全部取走，所以各段流量依次递减。

对一棵单入口、多出口的树，这条公式**每一段都算错**：入口到某个叶的压降，只沿**那一条路径**累加。其余分支的流量根本不流经这条路径。

`calibrate.py` L270–274 把这个区分写成两条「facts」：

> (1) The tree is a branching network, NOT a series pipe. ... For a tree the inlet-to-outlet drop is the drop along ONE root-to-leaf PATH.

## 口径 A 与口径 B

更麻烦的是：**几何本身不能决定压降**，还要指定出口边界条件。项目里明确写了两种（L276–297）：

| 口径 | 含义 | 谁在用 |
| --- | --- | --- |
| **A 需求驱动** | 每个叶按设计需求取流，`Q_parent = Σ Q_children` | `assign_radii`、`node_flows`、对照组（每支 `q/n`）——也是 Murray 定律推导时就假定的那种 |
| **B 阻力驱动** | 所有叶接在同一压力集管上，Kirchhoff 分配流量，需求无关 | 只作为对照报告（`dp_kirchhoff_reference_pa`） |

同一棵树上的实测差异（`calibrate.py` L288–297）：

- 这棵树 61 叶，叶深 11–16，各子树阻力相差 **35.6 倍**；
- 口径 B 只有口径 A 的 **0.85 倍**（低 15%）；
- `path_spread_x`：A 给出 **1.344×**（因为叶深不同，路径长度也影响压降），B 给出 **1.000×**——**因为「所有叶同一压力」就是 B 的定义**，所以这个数在 B 下恒为 1，不构成任何证据。

这一条值得单独记：**口径 B 的「完美均衡」是同义反复。**

## 接头损失怎么算

`tree_dp_pa`（L440–448）写明了最终报告的量：

> The reported `dp_pa` is therefore max over leaves of (viscous + junction), not (max viscous) + (all junctions).

也就是：**先对每个叶求「沿路径的黏性 + 路径上的接头」之和，再对所有叶取最大**。不是把所有接头都加上——那样会把不属于同一条路径的损失叠加到一个根本不存在的「最坏路径」上。

另外两个细节：

- F2：接头的参考面积用**父管半径** `radii[v]`，不是 `min(父, 子)`。老写法会在伪分叉处取到侧支喉部，算出一个不存在的缩颈。
- 根不算接头（它的损失是入口项，不在这个函数范围内）。

## 数字的坑：7.3472 不是 Pa

`run_report.json` 的 `compare.tree.pressure_drop = 7.3472`、`straight = 0.0237`、比值 `310.17`。

这三个数字来自 `verify.poiseuille_dp(edges, radii, grid_x, pitch_mm)`，而 `tree_group` 的默认参数是 `pitch_mm = PITCH_MM = 1.0`（`verify.py` L228）。所以：

> **7.3472 是无量纲数**，不是 Pa，也不是 kPa。它不能直接和泵的 31,700 Pa 关断扬程比较。

要得到帕斯卡，必须走 `calibrate.tree_dp_pa`，并且传 `grid_mm = 0.9`——这也正是它为什么要 `raise` 掉 1.0（见 [FM-1 尺度混用](/notes/fm-1-scale/)）。

**结论**：`310.17×` 这个比值在「同口径、同无量纲」下是有效的相对比较，但**不能说「树的压降是 7.3 kPa」**。

## 检测清单

- 看到 `sum(...)` 遍历边，先问：拓扑是串联还是分叉？
- 看到压降/流阻，先问：出口边界是什么？需求驱动还是压力驱动？
- 看到两个口径给出不同答案，先问：哪个口径下这个指标恒为 1 或恒为 0？
- 看到比值的两个数，先问：它们的单位是不是同一个（或者都无量纲）？

## 相关

- 比较的另一半（温度） → [公平比较的三级基准](/notes/fairness-basis/)
- 尺度问题 → [FM-1 尺度混用](/notes/fm-1-scale/)
- 记账问题 → [FM-4 守恒记账](/notes/fm-4-conservation/)

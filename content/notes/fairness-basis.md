---
title: "公平比较的三级基准"
date: 2026-10-25
draft: false
tags: ["验证", "方法"]
description: "树和直通道比，怎么比才算公平？占格数、材料量、总占据格，三个基准给出三种答案。"
---

## 为什么「公平」是个技术问题

对照组如果是 50 条通到底的直通道，它会有 50 × 50 = 2500 个格子和冷端接触；树只有 400 格。这不是「树更省材料」，这是**对照组被塞了 6.6 倍大的冷边界**。

`heat_tree.py` L172–175 把这件事写在代码里当注释：

> Fairness: the control must occupy the SAME NUMBER OF CELLS as the tree and have the SAME total cross-section. (Equal material alone is not enough: 50 full-length channels occupy 2500 cells vs the tree's 400, handing the control 6.6x more cold boundary.)

注意这句话本身就在说：**「等材料」是不够的**。所以项目用了不止一个基准。

## 三级基准

| 基准 | 约束什么 | 在哪里实现 |
| --- | --- | --- |
| ① 等钉住格数 | 两组与冷端接触的格子数相同 | `tree_group` / `straight_group` 的 `pinned_cells` |
| ② 等材料面积 | 两组通道横截面积总和相同 | `tree_material_mm2` → `total_area_mm2` 传给直通道组 |
| ③ 等总占据格 | 两组占的板面格数相同 | `n_ctrl = max(1, n_cells // grid)` |

第 ③ 条在 `heat_tree.py` L178–181：

```python
n_cells = len(set([p for p, _ in edges] + [c for _, c in edges]))
n_ctrl = max(1, n_cells // grid)
sg = V.straight_group(T, src, n_channels=n_ctrl,
                      total_area_mm2=tg.total_area_mm2, grid_x=grid, grid_y=grid)
```

400 // 50 = 8，所以对照组是 8 条直通道——`run_report.json` 里 `compare.straight.segments = 8` 与之一致。每条通道 50 格，共 400 格，正好等于树的节点数。

## 等材料：651.461 mm² 是怎么算的

`tree_material_mm2`（`verify.py` L211–224）不是把每条边的 `πr²` 加起来，而是**每个节点算一次、取它自己和相邻段里最大的半径**：

```python
for p, c in edges:
    for node, other in ((p, c), (c, p)):
        r = max(radii[node], radii[other])
        r_at[node] = max(r_at.get(node, 0.0), r)
return float(sum(np.pi * r ** 2 for r in r_at.values()))
```

理由写在 docstring 里：按边求和会把分叉点重复计算，历史上正是这么干，导致对照组算出「2500 格板子里塞 573 条通道」这种造不出来的东西。

`run_report.json` 里两组 `material_mm2` 都是 `651.461`——因为它们本来就是同一个数传过去的，这是**构造上的相等**，不是测出来的巧合。

## 结果：热学打平，水力输了

| 指标 | 树 | 直通道 | 差 |
| --- | ---: | ---: | ---: |
| `T_max_C` | 27.596 | 27.596 | 0.0 |
| `T_mean_solid_C` | 25.02 | 25.02 | -0.0 |
| `hotspot_area_mm2` | 25.0 | 25.0 | 0.0 |
| `pressure_drop` | 7.3472 | 0.0237 | **310.17×** |

`verdict` 原文：「tree: tied on T_max, tied on mean solid T, tied on hot zone, higher pressure drop」。

三点必须同时说清楚，否则这条结论会被误读：

1. **`pressure_drop` 是无量纲数**，不是 Pa。要换成帕斯卡必须走 `calibrate.tree_dp_pa`，且必须传 `grid_mm = 0.9`。见 [FM-2 压降口径](/notes/fm-2-dp/)。
2. **温度是归一化后的**（峰值 100 °C 的无量纲装置），27.596 不等于任何真实芯片温度。见 [温度场](/notes/thermal-field/)。
3. **打平发生在 25 格的热源上**（`hotspot_area_mm2 = 25.0`），也就是合成尺度的极端源，不是 289 格的真实尺度源。见 [热源饱和](/notes/source-saturation/)。

## 学到的通用规则

> 「打平」这句话必须带三个定语：在什么基准下、用什么口径、在哪个源尺度上。少一个，结论就不成立。

任何一个换掉都会改答案：换基准（等材料而非等占据格）、换口径（串联和而非路径最大）、换源（25 格而非 289 格）。这也是为什么这个项目的验证部分（`verify.py`，932 行）比主线（1,122 行）短不了多少——**比较本身就是一个模型**。

延伸阅读：[FM-4 守恒记账](/notes/fm-4-conservation/) 讲节点与边的区别，[FM-7 框架盲区](/notes/fm-7-blindspot/) 讲为什么有些检查天然不会失败。

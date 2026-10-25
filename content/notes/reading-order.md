---
title: "阅读顺序：先读哪几个文件"
date: 2026-10-25
draft: false
tags: ["导航", "方法"]
description: "为什么必须先读 field.py，最后才碰 conjugate_3d_flow.py。附每个文件的读法。"
---

初学者最容易犯的错，是按文件夹顺序读，结果在第 3 个文件就卡住。正确的顺序是**顺着数据流走**：温度场 → 树 → 半径 → 网格 → 验证。

## 第一轮：只读四个函数

| 顺序 | 文件 | 只读这一个东西 | 为什么 |
| --- | --- | --- | --- |
| 1 | `field.py` | `_solve_poisson` | 全部下游输入都是它的输出 `T` |
| 2 | `grow.py` | `grow_tree` | 124 行里只有这一个算法 |
| 3 | `radius.py` | `node_flows` + `assign_radii` | 半径的来历，两处共 40 行 |
| 4 | `heat_tree.py` | `main()` 的 Step 1–5 | 装配线，看一眼就知道各模块怎么接 |

四个函数读完，主线就通了。`heat_tree.py` 里其余都是打印和写 JSON。

## 第二轮：验证与几何

- `verify.py`（932 行）——**别看全**。先看 `apply_channels`（把通道写进温度场）、`tree_group` / `straight_group`（构造两组）、`compare`（算差）。剩下的 `tree_material_mm2`、`hotspot` 之类可以按需查。
- `mesh.py`（188 行）——`cylinder_tris`、`export_stl`、`stl_manifold_report` 三个函数，读完就懂 STL 是怎么拼出来的。见 [STL 与可制造性](/notes/stl-and-manufacturability/)。
- `calibrate.py`（511 行）——**先读 `paper_grid_mm` 的 docstring**（L225–255），它解释了为什么项目里同时存在 1.0 和 0.9 两个格距。这是全项目最关键的一段注释。见 [两把尺子](/notes/two-calibers/)。
- `generator.py`（746 行）——只在你要「自己设计一棵能造出来的树」时才读。核心是 C1/C2/C3 三个约束，以及 `r0` 是由叶数反解出来的，不是拍脑袋定的。

## 第三轮：3D

`conjugate_3d.py` 和 `conjugate_3d_flow.py` **放到最后读**，因为它们的可信度取决于你对 2D 部分的理解。而且它们的名字必须读准：前者是「三维导热 + 等温通道列」，后者是「三维导热 + 一维冷却剂沿程推进」，**都不是 CFD**。见 [3D 路线必须诚实定名](/notes/3d-route-honesty/)。

## 读代码时的三个检查点

1. **每次看到数字，先问单位。** `PITCH_MM = 1.0` 后面没有单位；`grid_mm = 0.9` 才有 mm。见 [FM-1 尺度混用](/notes/fm-1-scale/)。
2. **每次看到 `def f(..., x=0.5)`，问谁会省略它。** 省略就会静默用默认值。见 [FM-3 参数没传下去](/notes/fm-3-params/)。
3. **每次看到 `pass=True`，问「什么情况下会 False」。** 如果答不上来，这个检查大概率是恒等式。见 [FM-7 框架盲区](/notes/fm-7-blindspot/)。

读完这条线，再回头看 [项目全景](/notes/project-overview/) 里的 `compare` 数字，你就能自己判断哪些能引用、哪些不能。

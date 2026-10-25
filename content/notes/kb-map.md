---
title: "知识地图：从这里开始"
date: 2026-10-25
draft: false
tags: ["导航", "总览"]
description: "16 篇笔记的入口：先读什么、每篇讲什么、彼此怎么连。"
---

这个库只讲一件事：一个 50×50 网格上的仿生分叉通道散热器，从温度场出发长成一棵树，导出成 STL，再拿去和直通道做一次公平比较。

规则只有一条：**每个数字都要有出处**——要么是仓库里的文件名加行号，要么是 `outputs/run_report.json` 的字段。查不到出处的数字不写。

## 三条入门路线

| 你想知道 | 走这条线 |
| --- | --- |
| 这项目到底在干什么 | [项目全景](/notes/project-overview/) → [公平比较的三级基准](/notes/fairness-basis/) |
| 想自己读懂代码 | [阅读顺序](/notes/reading-order/) → [温度场](/notes/thermal-field/) → [贪心生长](/notes/greedy-growth/) → [Murray 定律](/notes/murray-law/) |
| 想知道哪里容易错 | [FM-1 尺度混用](/notes/fm-1-scale/) → [FM-2 压降口径](/notes/fm-2-dp/) → [FM-7 框架盲区](/notes/fm-7-blindspot/) |

## 全部笔记

**总览层**

- [项目全景](/notes/project-overview/) —— 一条 Step 1–5 的流水线，六个文件，1,122 行。
- [阅读顺序](/notes/reading-order/) —— 为什么必须先读 `field.py`，最后才碰 `conjugate_3d_flow.py`。

**模型层**

- [温度场：五点差分与 Jacobi](/notes/thermal-field/) —— 一个泊松方程，4513 次迭代，一个只验证了一半的 sanity check。
- [两把尺子](/notes/two-calibers/) —— `PITCH_MM = 1.0` 和 `grid_mm = 0.9` 为什么不能合并。
- [热驱动贪心生长](/notes/greedy-growth/) —— 树不是设计出来的，是「每次吸走最热的邻居」长出来的。
- [Murray 定律与它的恒等式陷阱](/notes/murray-law/) —— 检查一定通过，因为它检查的是自己的定义。

**验证层**

- [公平比较的三级基准](/notes/fairness-basis/) —— 占格数、材料量、总占据格，三个基准给出三种答案。
- [热源饱和](/notes/source-saturation/) —— 289 格 108 W/cm² 和 25 格 1249 W/cm² 是同一个总功率。
- [STL 与可制造性](/notes/stl-and-manufacturability/) —— `closed = true` 但 `is_manifold = false`，这两个不矛盾。

**失效模式层**

- [FM-1 尺度混用](/notes/fm-1-scale/) —— 10% 的格距差，52% 的单段流阻差，16 倍的总压降差。
- [FM-2 压降口径](/notes/fm-2-dp/) —— 树不是串联管，399 条边不能求和。
- [FM-3 参数没传下去](/notes/fm-3-params/) —— 默认值就是静默兜底。
- [FM-4 守恒记账](/notes/fm-4-conservation/) —— 节点只算一次，边不是节点。
- [FM-7 框架盲区](/notes/fm-7-blindspot/) —— 绿灯说明的是检查，不是物理。

**反思层**

- [3D 路线必须诚实定名](/notes/3d-route-honesty/) —— 「三维导热 + 一维冷却剂沿程推进」不是 CFD。

## 怎么读这张图

首页是全库全景。点任意一篇进去，正文底下会显示以它为中心的邻域图——直接连着谁，一目了然。圆形是笔记，方块是标签枢纽；实线是正文里写了链接，虚线是标签归属。

---
title: "FM-3 参数没传下去：默认值就是静默兜底"
date: 2026-10-25
draft: false
tags: ["失效模式"]
description: "函数签名里的 x=0.5，是「忘传」与「故意用 0.5」之间唯一的区别——而这个区别在代码里看不见。"
---

## 形态

一个物理参数有默认值。调用方没传。函数用了默认值。**没有报错，结果只是换了一套物理。**

这类缺陷最阴的地方在于：它不在任何一行的语法里，而在「调用方和定义方的意图不一致」这个缝隙里。

## 本项目里的三个实例

### ① 源区半径（最严重的一次）

`field.py` L32–35 自述：

> The old default (2.0 everywhere) is what let a caller run the physical comparison at 12.7x the real power density without noticing.

老默认 `SRC_RADIUS_SYNTHETIC = 2.0` 一直兜底，直到有人想算「真实尺度」却忘了改参数，整个物理比较跑在 12.7 倍热流密度上。修复方式：**删掉可省略的可能**——合成源现在必须显式传 `SRC_RADIUS_SYNTHETIC`，默认值是 `SRC_RADIUS_REAL`。见 [热源饱和](/notes/source-saturation/)。

### ② STL 的格距

`mesh.export_stl(..., pitch_mm: float = 1.0)`（L87）。默认 1.0，而真实调用必须传 0.9。

好在 `heat_tree.py` L159 显式写了 `pitch_mm = C.paper_grid_mm(grid)`，所以这次没出错。但只要有人新写一个脚本忘了传，就会得到「几何放大 11%」的 STL，而且它是合法的二进制文件，看不出问题。见 [STL 与可制造性](/notes/stl-and-manufacturability/)。

### ③ 源功率权重

`verify.apply_channels(..., strength=None)`（L142–148）：

> `strength` is the per-cell source term. When it is None the boolean mask `src` is used, i.e. every source cell carries the same q ... Passing the weighted field from `field.source_strength_multi` is what makes an unequal-power experiment possible: **without it the re-solve silently reverts to equal power** and the controls come out identical across power sets (which is exactly how the bug was found).

注意最后半句：这个 bug 是被「对照组在不同功率设置下结果完全一样」暴露的。**异常结果本身就是检测手段**——当两组本该不同的实验给出相同数字时，先怀疑参数没传进去。

## 为什么默认值危险

| 默认值的作用 | 正常场景 | 故障场景 |
| --- | --- | --- |
| 减少调用噪声 | 90% 的调用不需要改它 | 10% 需要改，但忘了 |
| 向后兼容 | 老脚本不用改 | 老脚本的**错误假设**被永久保留 |
| 表达「推荐值」 | 新人抄默认值就对了 | 默认值其实是「历史遗留」而不是「物理最优」 |

第三行最致命：默认值一旦写下，它就同时承担了「推荐」和「未指定」两种语义，而代码无法区分。

## 三种修复强度

1. **弱**：在 docstring 里写「必须传 X」。靠人读。
2. **中**：改成关键字必填（`*, pitch_mm`），不给默认值。忘传直接 `TypeError`。
3. **强**：从别的量**推导**出来，根本不给调用方选择。`paper_grid_mm(grid)` 属于这一级——它从 `PACKAGE_MM / grid` 算，调用方没有机会传错。

第四种，也是这个项目用过的：**在入口处主动拒绝**。`tree_dp_pa` 见到 `grid_mm == PITCH_MM` 就 `raise ValueError`，把静默错误变成显式崩溃（L452–457）。

## 检测清单

- `grep "def .*=" *.py`，逐个看默认值：它是「物理推荐值」还是「懒得改的历史残留」？
- 任何影响能量、质量、几何尺度的参数，必须显式传。
- 任何「两组实验结果完全相同」的现象，先查参数传递链。
- 默认值变化属于**接口变更**，必须记录在案（`field.py` 就把老默认的后果写进了注释）。

## 相关

- 尺度类的同类错误 → [FM-1 尺度混用](/notes/fm-1-scale/)
- 参数没传导致守恒失效 → [FM-4 守恒记账](/notes/fm-4-conservation/)
- 检查为什么抓不到 → [FM-7 框架盲区](/notes/fm-7-blindspot/)

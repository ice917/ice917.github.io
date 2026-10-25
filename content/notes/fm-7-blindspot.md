---
title: "FM-7 框架盲区：绿灯说明的是检查，不是物理"
date: 2026-10-25
draft: false
tags: ["失效模式", "反思"]
description: "三个「通过」的检查，两个是恒等式，一个是同义反复。问题不在于检查写错了，而在于它们不可能失败。"
---

## 形态

框架盲区不是某一行的 bug，而是**整套验证方式与物理脱钩**：检查全部通过，但它检查的对象是代码内部的自洽性，不是模型对现实的描述。

判断标准只有一句：**什么输入会让这个检查失败？** 如果答不上来，它就不是检查。

## 实例一：Murray 检查是恒等式

`check_murray` 计算 `r_parent³ / Σ r_child³` 的误差。但半径的定义就是 `r = r0 · N^(1/3)`，所以

$$r_{\text{parent}}^3 = r_0^3 \sum N_{\text{child}} = \sum r_{\text{child}}^3$$

误差恒为 0。实测 `max_rel_err = 4.845e-16`——这是浮点噪声，不是「精度很高」。

它真正能抓的只有一种错：某个节点的手工半径覆盖、或半径和 flow 用了不同参数。**物理正确性完全不在它的覆盖范围内**：`r0` 取 0.5 还是 5.0，它都通过。见 [Murray 定律](/notes/murray-law/)。

## 实例二：3D 的「打平」是同义反复

`conjugate_3d.py` 的 D1（L19–27）记录得很清楚：

> The channel clamp covered the FULL depth, including the top layer that carries the source. ... in both groups the mask covered 25/25 source cells and `Tn[:, mask] = T_cool` erased the injected heat. The solver then converged in ONE iteration to a uniform field at the coolant temperature: tree = straight = 25.0000 exactly. **The published "3D tie" was therefore a tautology, not a result.**

场从一开始就被钉成 25 °C 均匀，两组当然完全相等。这不是「3D 验证了 2D 的结论」，这是「边界条件把问题删掉了」。

修复方式是留一层固体表皮 `channel_top_gap = 1`，让源保持活跃、热量必须穿过表皮才能进通道。

**这条最值得记住**：一个结果如果「太干净」（完全相等、误差为零、比值恰好是 1），先怀疑是条件写死了。

## 实例三：sanity check 只覆盖了衰减长度

`field.py` 的 `sanity_check_log_decay` 比较数值衰减斜率与解析值：`ratio = 1.0064`、`R² = 0.99998`。

它证明的是「网格上的径向衰减率对了」。它**不**证明：

- 源区总功率对不对（源强度怎么归一化，它不查）；
- 网格加密后是否收敛（没有 h 收敛研究）；
- 绝对值有没有物理意义（下一步 `normalize_field` 就把峰值拉到 100 °C 了）。

一个检查通过，只等于「它想测的那个量」通过。写结论时必须把「它想测的是什么」一起写出来。

## 实例四：口径 B 的 1.000×

`calibrate.py` L294–297：`path_spread` 在口径 B 下**恒为 1.000**，因为「所有叶同一压力」就是 B 的定义。这个数在 B 下没有任何信息量，只能作为 A 的对照。见 [FM-2 压降口径](/notes/fm-2-dp/)。

## 怎么建检查才不是自欺

| 做法 | 例子 |
| --- | --- |
| 用**独立来源**算同一个量 | 三角形数手算 399×48 = 19152，与导出结果对比 |
| 用**极限/退化情形**验 | `Pi → ∞` 时 3D 模型必须退化为 `conjugate_3d.py`（R15 回归守卫） |
| 用**缩放律**验 | 半径比的三次方 = 叶数比，`(1.9682/0.5)³ = 61` |
| 让检查**能失败** | 故意传错格距，`tree_dp_pa` 必须 `raise` |
| 把残差**写进输出** | 能量闭合误差 1.6e-5，随结果一起存 JSON |

反模式：

- 用同一个公式的正反变换互检（恒等式）；
- 用被钉死的边界条件验证「两组相同」（同义反复）；
- 只报告 `pass: true`，不报告「什么情况下会 false」。

## 一句话

> 一个检查的价值，等于它能失败的方式的数量。

## 相关

- 恒等式的完整推导 → [Murray 定律](/notes/murray-law/)
- 被钉平的场 → [热源饱和](/notes/source-saturation/)
- 3D 的正确命名与极限 → [3D 路线必须诚实定名](/notes/3d-route-honesty/)

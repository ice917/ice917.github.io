---
title: "4. 为什么是 SVG 和 MCP"
date: 2026-10-28
draft: false
tags: ["SVG", "MCP", "外部表征", "工具设计"]
description: "SVG 是空间关系的最佳外部载体（认知科学 40 年前的结论）；MCP 是把裁判交付给 AI 的标准形态。工具描述=接口，质量有量化证据。"
---

## 形态

第三章定了"生成→裁决→修正"的骨架，还差两个选择：**图用什么形式表达**，**裁判用什么方式交付**。答案是 SVG 和 MCP，两者都有硬依据。

## 为什么是 SVG

**1. 认知科学的旧结论：图示使空间关系显式化。** Larkin & Simon《Why a Diagram is (Sometimes) Worth Ten Thousand Words》（Cognitive Science, 1987, A 级）：信息等价≠计算等价——图示把文本里"隐含"的关系变成"直接读出"，大幅减少搜索与工作记忆。Scaife & Rogers（IJHCS 1996, A 级）进一步给出"外部认知"框架：外部表征实现计算卸载。**让 AI 先画 SVG 再推理，本质是给它装一个外部工作记忆。**

**2. SVG 是"可断言的图"。** 位图只能看，SVG 是代码：元素有 id、坐标、尺寸，可以解析、可以算 bbox、可以断言"rect[1] 在 circle[1] 左边 8px 外"。同一份 SVG 既是给人看的图，又是给裁判用的结构化数据，还是给 RL 用的可验证奖励源——三位一体。

**3. LLM 生成 SVG 的几何正确性普遍差，校验是刚需。** SVGenius/SVGEditBench（ACM MM 2025, B 级）统计的高频错误：path 命令错、坐标幻觉、文本溢出容器、锚点错位、元素出画布。这恰好说明"生成器 + 裁判"的分工是对的。

## 为什么是 MCP

**1. 生态空白（2026-10 核实）。** 现有 SVG-MCP（validate/render/diff/lint 有、几何断言**无**、项目停更）、svgmaker-mcp（云端 API）、excalidraw/mermaid/blender 类 MCP 都不做"几何关系断言/可验证奖励"。最接近的 GeoSVG-RL（B 级）是训练框架不是工具产品。裁判这个位置，当时没人坐。

**2. 工具协议就是"接口质量"问题。** Frontiers of CS 2025（A 级）工具学习综述：工具描述/接口质量直接决定调用成功率；Interface Drift（B 级）量化到**描述修复可把成功率从 0.58 拉到 0.81**；措辞差异甚至能造成 10 倍调用率差。所以"写好工具描述"不是文案工作，是接口工程——这也是后文 skill-opt 优化的对象。

**3. MCP 的错误语义天然匹配"可自纠反馈"。** 协议定义了 `isError` + 可自纠消息的通道：裁判的失败提示（差多少、往哪移）可以原样递到 AI 面前，不需要中间翻译层。

## 工具清单的取舍原则

BFCL 稳健性（B 级）：语义相近的工具放一起就掉点；Brittlebench（B 级）：语义扰动平均 -21%。所以工具数克制（最终 8 个）、单一职责、命名可区分：

```
校验内核（自研，差异化）：get_geometry / assert_relations / check_layout_contract / score_reward
现成库封装（不造轮子）：validate_svg / render_svg / diff_render / lint_svg
```

## 一句话结论

SVG 让空间关系**可断言**，MCP 让裁判**随取随用**，工具描述质量决定 AI 用不用得起来。三者凑齐，第三章的范式才从论文变成手边的工具。

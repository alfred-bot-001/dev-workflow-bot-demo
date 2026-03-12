# Dev Workflow Bot Demo — 架构设计文档

> 创建于 2026-03-12

---

## 项目概述

一个聊天交互式软件开发流程 Demo，模拟 AI Bot 驱动的完整研发生命周期：
**需求认领 → 技术规范 → 代码开发 → Code Review → 测试 → 发布**

灵感来源：zkkyc demo（FastAPI + 单页 Web 交互演示）

---

## 目标

展示 AI Bot 如何作为"研发助理"驱动整个软件开发流程，核心理念：
- Bot 主动推进，人类只做关键决策（审批节点）
- 支持多任务并行
- 每个步骤有清晰的状态和角色

---

## 角色定义

| 角色 | 说明 |
|------|------|
| **用户 (Dev)** | 开发者，接受 Jira 任务，做关键审批 |
| **Bot** | AI 研发助理，自动执行各类开发任务 |
| **小B (Tester)** | 测试人员，审批测试计划、接收测试结果 |
| **小C (Release)** | 发布人员，负责最终生产发布 |

---

## 完整流程（12步）

```
Step 1  │ [Dev] 打开 Bot → 看到今日 Jira Tickets → Bot 问是否开始开发
Step 2  │ [Dev] 回复"开始" → 选择目标 Ticket
Step 3  │ [Bot] 拉代码分支 + 生成 Spec 文档 → 返回 GitHub 链接 → 等待 Review
Step 4  │ [Dev] 审批 Spec → 下达"开始开发"命令
Step 5  │ [Dev] 同时开启其他任务（并行任务演示）
Step 6  │ [Bot] 开发完成 → 自动执行第一轮 Code Review → 生成报告
Step 7  │ [Bot] 通知 Dev 代码完成 + PR 链接 → Dev Review → 审批通过
Step 8  │ [Bot] 自动创建测试环境 + 部署 → 通知小B
Step 9  │ [小B] 收到测试任务 → Review 测试用例 → 审批开始测试
Step 10 │ [Bot] 执行测试 → 通知小B 任务完成 + 测试报告
Step 11 │ [Bot] 触发发布流程 → 通知小C
Step 12 │ [小C] 确认 → 执行生产发布 → 全流程完成
```

---

## 技术架构

### 后端
- **Python 3.10+** + **FastAPI**
- 状态机管理：每个 Ticket 有独立状态（`WorkflowState`）
- 并行任务：支持多 Ticket 同时进行，互不阻塞
- WebSocket：实时推送 Bot 消息和状态变更

### 前端
- 纯 HTML + CSS + JavaScript（无框架）
- 三栏布局：
  - **左栏**：Jira Ticket 列表 + 并行任务看板
  - **中栏**：聊天窗口（主交互区）
  - **右栏**：当前步骤详情 + 技术说明

### 数据结构

```python
class WorkflowState(Enum):
    IDLE = "idle"
    WAITING_START = "waiting_start"          # Step 1: 等用户确认
    GENERATING_SPEC = "generating_spec"       # Step 3: 生成Spec
    WAITING_SPEC_REVIEW = "waiting_spec"      # Step 3: 等Spec审批
    DEVELOPING = "developing"                 # Step 4-5: 开发中
    CODE_REVIEW = "code_review"               # Step 6: Bot自动Review
    WAITING_PR_REVIEW = "waiting_pr"          # Step 7: 等Dev审批PR
    DEPLOYING_TEST = "deploying_test"         # Step 8: 部署测试环境
    WAITING_TEST_APPROVAL = "waiting_test"    # Step 9: 等小B审批
    TESTING = "testing"                       # Step 9-10: 测试中
    WAITING_RELEASE = "waiting_release"       # Step 11: 等小C
    RELEASING = "releasing"                   # Step 12: 发布中
    DONE = "done"                             # 完成
```

### Mock Jira Tickets（Demo数据）

| ID | Title | Priority |
|----|-------|----------|
| PROJ-101 | 用户登录页面优化 | High |
| PROJ-102 | 支付接口集成 | High |
| PROJ-103 | 报表导出功能 | Medium |
| PROJ-104 | 推送通知系统 | Medium |

---

## 目录结构

```
dev-workflow-bot-demo/
├── app.py                    # FastAPI 主入口
├── requirements.txt
├── start.sh                  # 一键启动
├── docs/
│   └── DESIGN.md             # 本文件（架构设计）
├── workflow/
│   ├── state_machine.py      # 状态机
│   ├── bot_actions.py        # Bot 执行的各类动作（模拟）
│   └── jira_mock.py          # Mock Jira 数据
└── static/
    ├── index.html            # 主页面
    ├── app.js                # 交互逻辑 + WebSocket
    └── style.css             # 样式
```

---

## 关键交互设计

### 聊天气泡类型
- `bot-message`：Bot 发出的消息（蓝色，左）
- `user-message`：用户发出（灰色，右）
- `system-event`：系统事件（居中小字，如"已创建分支"）
- `action-card`：带按钮的操作卡片（审批/拒绝）

### 并行任务
- 每个 Ticket 有独立的聊天线程（Tab切换）
- 任务看板显示所有进行中任务的实时状态
- 多任务互不干扰，可同时在不同阶段

### 角色视角切换
- 顶部有角色切换按钮：`Dev` / `小B Tester` / `小C Release`
- 切换后聊天区显示对应角色收到的消息
- 模拟多角色协作场景

---

## 动画 & 体验

- Bot 打字动画（typing indicator）
- 步骤进度条（12步高亮）
- 模拟延迟：
  - 生成 Spec：3s
  - 代码开发：5s（有进度条）
  - 测试执行：4s
  - 部署：3s
- GitHub 链接、PR 链接（Mock URL，样式真实）

---

## 启动方式

```bash
cd dev-workflow-bot-demo
./start.sh
# 打开 http://localhost:8088
```

---

## 后续扩展（不在本 Demo 范围）

- 真实 Jira API 集成
- 真实 GitHub API（创建分支/PR）
- 真实 CI/CD 触发
- 多用户实时协作

---

*本文档随功能变更持续更新*

"""Dev Workflow Bot Demo — FastAPI + WebSocket"""
import asyncio
import json
import time
from typing import Dict, Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

from workflow.jira_mock import TICKETS
from workflow.state_machine import TicketWorkflow, WorkflowState
from workflow.bot_actions import (
    simulate_create_branch,
    simulate_generate_spec,
    simulate_development,
    simulate_code_review,
    simulate_deploy_test_env,
    simulate_run_tests,
    simulate_release,
)

app = FastAPI(title="Dev Workflow Bot Demo")
app.mount("/static", StaticFiles(directory="static"), name="static")

# Global state
workflows: Dict[str, TicketWorkflow] = {}
connections: Set[WebSocket] = set()


async def broadcast(msg: dict):
    dead = set()
    for ws in connections:
        try:
            await ws.send_json(msg)
        except Exception:
            dead.add(ws)
    for ws in dead:
        connections.discard(ws)


async def send_message(role: str, ticket_id: str, text: str, msg_type: str = "chat", extra: dict = None):
    payload = {
        "type": msg_type,
        "role": role,
        "ticket_id": ticket_id,
        "text": text,
        "ts": time.time(),
    }
    if extra:
        payload.update(extra)
    await broadcast(payload)
    await asyncio.sleep(0.05)


async def send_typing(ticket_id: str, show: bool = True):
    await broadcast({"type": "typing", "ticket_id": ticket_id, "show": show})


async def update_workflow_state(workflow: TicketWorkflow):
    await broadcast({
        "type": "workflow_update",
        "ticket_id": workflow.ticket_id,
        "state": workflow.state.value,
        "state_label": workflow.to_dict()["state_label"],
        "step_number": workflow.to_dict()["step_number"],
    })


async def bot_say(ticket_id: str, text: str, delay: float = 0.8, extra: dict = None):
    await send_typing(ticket_id, True)
    await asyncio.sleep(delay)
    await send_typing(ticket_id, False)
    await send_message("bot", ticket_id, text, extra=extra)


async def system_event(ticket_id: str, text: str):
    await send_message("system", ticket_id, text, msg_type="system")


# ── Step 1: Bot greets and shows tickets ────────────────────────────────────
@app.get("/api/start_session")
async def start_session():
    """Called when user opens the app — bot sends greeting + ticket list"""
    tickets_text = "\n".join(
        [f"• **{t['id']}** [{t['priority']}] {t['title']} ({t['estimate']})" for t in TICKETS]
    )
    msg = f"早上好！👋 你今天有 **{len(TICKETS)} 个** Jira 任务：\n\n{tickets_text}\n\n要开始开发哪个？"
    return {"ok": True, "message": msg, "tickets": TICKETS}


# ── Step 2: User picks a ticket ─────────────────────────────────────────────
@app.post("/api/select_ticket/{ticket_id}")
async def select_ticket(ticket_id: str):
    ticket = next((t for t in TICKETS if t["id"] == ticket_id), None)
    if not ticket:
        return {"ok": False, "error": "Ticket not found"}

    wf = TicketWorkflow(ticket_id=ticket_id, ticket_title=ticket["title"])
    wf.state = WorkflowState.WAITING_START
    wf.started_at = time.time()
    workflows[ticket_id] = wf

    asyncio.create_task(run_step1(wf, ticket))
    return {"ok": True}


async def run_step1(wf: TicketWorkflow, ticket: dict):
    await update_workflow_state(wf)
    await bot_say(wf.ticket_id,
        f"收到 **{ticket['id']}** — {ticket['title']}\n\n"
        f"📋 需求描述：{ticket['description']}\n"
        f"⏱ 预估工时：{ticket['estimate']}\n\n"
        f"要开始做吗？我可以先生成技术规范文档。",
        delay=1.0,
        extra={"actions": [
            {"label": "✅ 开始，先做 Spec 文档", "action": "start_spec", "ticket_id": wf.ticket_id},
            {"label": "⏭ 跳过，直接开始开发", "action": "start_dev", "ticket_id": wf.ticket_id},
            {"label": "❌ 暂不处理", "action": "skip", "ticket_id": wf.ticket_id},
        ]}
    )


# ── Step 3: Generate Spec ────────────────────────────────────────────────────
@app.post("/api/action/{ticket_id}/{action}")
async def handle_action(ticket_id: str, action: str):
    wf = workflows.get(ticket_id)
    if not wf:
        return {"ok": False, "error": "No workflow"}

    asyncio.create_task(dispatch_action(wf, action))
    return {"ok": True}


async def dispatch_action(wf: TicketWorkflow, action: str):
    if action == "start_spec":
        await run_step3_spec(wf)
    elif action == "approve_spec":
        await run_step4_dev(wf)
    elif action == "reject_spec":
        await run_step3_spec_rejected(wf)
    elif action == "start_dev":
        await run_step4_dev(wf)
    elif action == "approve_pr":
        await run_step8_deploy(wf)
    elif action == "approve_test":
        await run_step9_test(wf)
    elif action == "approve_release":
        await run_step12_release(wf)
    elif action == "skip":
        await bot_say(wf.ticket_id, "好的，已跳过。有需要随时叫我 👍")


async def run_step3_spec(wf: TicketWorkflow):
    wf.state = WorkflowState.GENERATING_SPEC
    await update_workflow_state(wf)

    await bot_say(wf.ticket_id, "好的！我来拉代码分支并生成技术规范文档...", delay=0.5)

    # Create branch
    await system_event(wf.ticket_id, "⚙️ 正在创建 Git 分支...")
    branch = await simulate_create_branch(wf.ticket_id, wf.ticket_title)
    wf.branch_name = branch
    await system_event(wf.ticket_id, f"✅ 分支已创建：`{branch}`")

    # Generate spec
    await system_event(wf.ticket_id, "📝 正在生成技术规范文档（Spec）...")
    spec_url = await simulate_generate_spec(wf.ticket_id, wf.ticket_title)
    wf.spec_url = spec_url

    wf.state = WorkflowState.WAITING_SPEC_REVIEW
    await update_workflow_state(wf)

    await bot_say(wf.ticket_id,
        f"✅ 技术规范文档已生成！\n\n"
        f"📄 **Spec 文档**：[点击查看]({spec_url})\n"
        f"🌿 **开发分支**：`{branch}`\n\n"
        f"主要内容包括：技术选型、接口设计、数据模型、测试策略。\n\n"
        f"请 Review 后告诉我是否可以开始开发 👇",
        delay=1.2,
        extra={"actions": [
            {"label": "✅ Spec 没问题，开始开发", "action": "approve_spec", "ticket_id": wf.ticket_id},
            {"label": "✏️ 需要修改 Spec", "action": "reject_spec", "ticket_id": wf.ticket_id},
        ]}
    )


async def run_step3_spec_rejected(wf: TicketWorkflow):
    await bot_say(wf.ticket_id, "好的，我重新生成 Spec 文档，请稍候...", delay=0.6)
    wf.state = WorkflowState.GENERATING_SPEC
    await update_workflow_state(wf)
    await asyncio.sleep(2.5)
    spec_url = await simulate_generate_spec(wf.ticket_id, wf.ticket_title)
    wf.spec_url = spec_url
    wf.state = WorkflowState.WAITING_SPEC_REVIEW
    await update_workflow_state(wf)
    await bot_say(wf.ticket_id,
        f"✅ 已更新 Spec 文档！\n\n📄 **Spec**：[查看最新版本]({spec_url})\n\n再次请您 Review 👇",
        delay=1.0,
        extra={"actions": [
            {"label": "✅ 没问题，开始开发", "action": "approve_spec", "ticket_id": wf.ticket_id},
            {"label": "✏️ 再改一次", "action": "reject_spec", "ticket_id": wf.ticket_id},
        ]}
    )


# ── Step 4-6: Development + Code Review ─────────────────────────────────────
async def run_step4_dev(wf: TicketWorkflow):
    wf.state = WorkflowState.DEVELOPING
    await update_workflow_state(wf)

    await bot_say(wf.ticket_id, "🚀 开始开发！我会在完成后通知你。", delay=0.5)

    # Suggest parallel task
    other_tickets = [t for t in TICKETS if t["id"] != wf.ticket_id]
    if other_tickets:
        suggestion = other_tickets[0]
        await bot_say(wf.ticket_id,
            f"💡 提示：开发期间你可以同时处理其他任务，比如 **{suggestion['id']}** — {suggestion['title']}",
            delay=1.5,
            extra={"hint": "parallel_task", "suggest_ticket": suggestion["id"]}
        )

    # Development progress
    steps = await simulate_development(wf.ticket_id)
    for delay, step_text in steps:
        await asyncio.sleep(delay)
        await system_event(wf.ticket_id, f"⚙️ {step_text}")

    # Step 6: Auto Code Review
    wf.state = WorkflowState.CODE_REVIEW
    await update_workflow_state(wf)

    await system_event(wf.ticket_id, "🔍 Bot 正在执行第一轮 Code Review...")
    review = await simulate_code_review(wf.ticket_id)
    wf.pr_url = review["pr_url"]

    wf.state = WorkflowState.WAITING_PR_REVIEW
    await update_workflow_state(wf)

    # Step 7: Notify user
    issue_emoji = "⚠️" if review["issues"] > 0 else "✅"
    await bot_say(wf.ticket_id,
        f"🎉 代码开发完成！已完成第一轮自动 Code Review：\n\n"
        f"{issue_emoji} **{review['issues']} 个问题** / **{review['suggestions']} 条建议**\n"
        f"📊 {review['summary']}\n\n"
        f"🔗 **PR 链接**：[Pull Request]({review['pr_url']})\n\n"
        f"请你 Review 代码，确认没问题后审批 👇",
        delay=1.5,
        extra={"actions": [
            {"label": "✅ 代码没问题，审批通过", "action": "approve_pr", "ticket_id": wf.ticket_id},
            {"label": "💬 需要修改", "action": "reject_spec", "ticket_id": wf.ticket_id},
        ]}
    )


# ── Step 8: Deploy test environment ─────────────────────────────────────────
async def run_step8_deploy(wf: TicketWorkflow):
    wf.state = WorkflowState.DEPLOYING_TEST
    await update_workflow_state(wf)

    await bot_say(wf.ticket_id, "✅ PR 已审批！开始创建测试环境并部署...", delay=0.5)
    await system_event(wf.ticket_id, "🚀 正在创建独立测试环境...")

    test_url = await simulate_deploy_test_env(wf.ticket_id)
    wf.test_env_url = test_url
    await system_event(wf.ticket_id, f"✅ 测试环境已就绪：{test_url}")

    wf.state = WorkflowState.WAITING_TEST_APPROVAL
    await update_workflow_state(wf)

    # Notify tester B
    await bot_say(wf.ticket_id,
        f"📬 已通知 **小B（Tester）** 开始测试任务。\n\n"
        f"🌐 测试环境：[{test_url}]({test_url})\n"
        f"📋 测试用例已准备好，等待小B审批。",
        delay=1.2,
        extra={"notify_role": "tester"}
    )

    # Tester B perspective
    await asyncio.sleep(1.5)
    await broadcast({
        "type": "role_notification",
        "role": "tester",
        "ticket_id": wf.ticket_id,
        "text": f"📋 新测试任务：{wf.ticket_title}\n\n测试环境已就绪，请审批后开始测试。",
        "actions": [
            {"label": "✅ 审批，开始测试", "action": "approve_test", "ticket_id": wf.ticket_id},
        ]
    })


# ── Step 9-10: Testing ────────────────────────────────────────────────────────
async def run_step9_test(wf: TicketWorkflow):
    wf.state = WorkflowState.TESTING
    await update_workflow_state(wf)

    await bot_say(wf.ticket_id, "🧪 小B 已审批，开始执行测试...", delay=0.5)
    await system_event(wf.ticket_id, "🧪 正在执行自动化测试用例...")

    results = await simulate_run_tests(wf.ticket_id)
    passed_emoji = "✅" if results["failed"] == 0 else "⚠️"

    # Step 10: Notify tester B with results
    wf.state = WorkflowState.WAITING_RELEASE
    await update_workflow_state(wf)

    result_text = (
        f"{passed_emoji} **测试完成！**\n\n"
        f"📊 通过：{results['passed']}/{results['total']} | "
        f"失败：{results['failed']} | "
        f"覆盖率：{results['coverage']}\n"
        f"⏱ 耗时：{results['duration']}"
    )

    await bot_say(wf.ticket_id, result_text, delay=1.0, extra={"notify_role": "tester"})

    await asyncio.sleep(1.0)

    if results["failed"] == 0:
        # Notify release person C
        await bot_say(wf.ticket_id,
            f"✅ 测试全部通过！已通知 **小C（Release）** 准备发布。",
            delay=1.0,
            extra={"notify_role": "release"}
        )

        await asyncio.sleep(1.5)
        await broadcast({
            "type": "role_notification",
            "role": "release",
            "ticket_id": wf.ticket_id,
            "text": f"🚀 发布任务：{wf.ticket_title}\n\n测试已通过，请确认后开始生产发布。",
            "actions": [
                {"label": "🚀 确认发布到生产", "action": "approve_release", "ticket_id": wf.ticket_id},
            ]
        })
    else:
        await bot_say(wf.ticket_id,
            f"⚠️ 有 {results['failed']} 个测试用例失败，请小B查看详情。",
            delay=0.8
        )


# ── Step 12: Release ──────────────────────────────────────────────────────────
async def run_step12_release(wf: TicketWorkflow):
    wf.state = WorkflowState.RELEASING
    await update_workflow_state(wf)

    await bot_say(wf.ticket_id, "🚀 开始生产发布！", delay=0.5)
    await system_event(wf.ticket_id, "🔄 正在执行生产部署流程...")

    result = await simulate_release()
    await system_event(wf.ticket_id, f"✅ 部署完成，耗时 {result['duration']}")

    wf.state = WorkflowState.DONE
    await update_workflow_state(wf)

    await bot_say(wf.ticket_id,
        f"🎉 **{wf.ticket_id} 发布成功！**\n\n"
        f"📦 版本号：**{result['version']}**\n"
        f"🌐 生产地址：[{result['deploy_url']}]({result['deploy_url']})\n\n"
        f"整个流程已完成 ✅",
        delay=1.5,
        extra={"final": True}
    )


# ── WebSocket ────────────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connections.add(websocket)
    try:
        # Send current state of all workflows
        for wf in workflows.values():
            await websocket.send_json({
                "type": "workflow_update",
                "ticket_id": wf.ticket_id,
                **wf.to_dict()
            })
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connections.discard(websocket)


# ── Static pages ─────────────────────────────────────────────────────────────
@app.get("/")
async def index():
    return FileResponse("static/index.html")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8088, log_level="warning")

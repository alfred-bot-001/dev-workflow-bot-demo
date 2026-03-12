// Dev Workflow Bot Demo — Frontend Logic

const STEPS = [
  { num: 1,  label: "打开 Bot，查看 Jira" },
  { num: 2,  label: "选择任务" },
  { num: 3,  label: "生成技术规范 Spec" },
  { num: 4,  label: "Dev 审批，下令开发" },
  { num: 5,  label: "并行任务（可选）" },
  { num: 6,  label: "Bot 自动 Code Review" },
  { num: 7,  label: "Dev 审批 PR" },
  { num: 8,  label: "部署测试环境 & 通知小B" },
  { num: 9,  label: "小B 审批，开始测试" },
  { num: 10, label: "测试完成，通知小B" },
  { num: 11, label: "触发发布，通知小C" },
  { num: 12, label: "小C 发布到生产" },
];

// State
let ws = null;
let currentRole = "dev";  // dev | tester | release
let activeTicketId = null;
let chatThreads = {};   // ticketId -> { messages: [] }
let workflowStates = {}; // ticketId -> { state, step_number, ... }
let typingTickets = new Set();
let roleNotifications = {}; // role -> [{ ticket_id, text, actions }]

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  connectWS();
  initRoleSwitcher();
  renderSteps();
  loadInitialGreeting();
});

async function loadInitialGreeting() {
  const res = await fetch("/api/start_session");
  const data = await res.json();
  // Show greeting in a "global" channel
  showGreeting(data);
}

function showGreeting(data) {
  if (!chatThreads["__global__"]) chatThreads["__global__"] = { messages: [] };
  appendMessage("__global__", {
    role: "bot",
    text: data.message,
    ts: Date.now() / 1000
  });
  if (!activeTicketId) {
    activeTicketId = "__global__";
    renderChat("__global__");
  }
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
function connectWS() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onmessage = (e) => handleServerMsg(JSON.parse(e.data));
  ws.onclose = () => setTimeout(connectWS, 2000);
}

function handleServerMsg(msg) {
  switch (msg.type) {
    case "chat":
    case "system":
      handleChatMsg(msg);
      break;
    case "typing":
      handleTyping(msg);
      break;
    case "workflow_update":
      handleWorkflowUpdate(msg);
      break;
    case "role_notification":
      handleRoleNotification(msg);
      break;
  }
}

function handleChatMsg(msg) {
  const tid = msg.ticket_id || "__global__";
  if (!chatThreads[tid]) chatThreads[tid] = { messages: [] };
  chatThreads[tid].messages.push(msg);

  if (activeTicketId === tid) {
    renderMessage(msg);
    scrollToBottom();
  } else {
    // Badge notification
    const tab = document.querySelector(`.chat-tab[data-tid="${tid}"]`);
    if (tab && !tab.classList.contains("active")) {
      tab.style.borderColor = "var(--accent2)";
    }
  }
}

function handleTyping(msg) {
  const tid = msg.ticket_id || "__global__";
  if (msg.show) typingTickets.add(tid);
  else typingTickets.delete(tid);

  if (activeTicketId === tid) {
    const el = document.getElementById("typing-row");
    if (el) el.style.display = msg.show ? "flex" : "none";
  }
}

function handleWorkflowUpdate(msg) {
  workflowStates[msg.ticket_id] = msg;
  updateTicketCard(msg.ticket_id);
  if (activeTicketId === msg.ticket_id) {
    renderSteps(msg.step_number);
    updateInfoPanel(msg.ticket_id);
  }
}

function handleRoleNotification(msg) {
  if (!roleNotifications[msg.role]) roleNotifications[msg.role] = [];
  roleNotifications[msg.role].push(msg);

  if (currentRole === msg.role) {
    showRoleNotificationBanner(msg);
  }
}

// ── Ticket UI ─────────────────────────────────────────────────────────────────
async function selectTicket(ticketId) {
  const ticket = window.__tickets.find(t => t.id === ticketId);
  if (!ticket) return;

  // Ensure thread exists and switch to it
  if (!chatThreads[ticketId]) chatThreads[ticketId] = { messages: [] };
  addChatTab(ticketId, ticket.title);
  switchChatTab(ticketId);

  const alreadyStarted = !!workflowStates[ticketId];

  if (!alreadyStarted) {
    // First time: call API, let server send bot message
    await fetch(`/api/select_ticket/${ticketId}`, { method: "POST" });
  } else {
    // Already in progress: re-show task description locally with state-aware buttons
    const state = workflowStates[ticketId];
    const actions = getActionsForState(state?.state, ticketId);
    const stateLabel = state?.state_label || "";
    const descMsg = {
      role: "bot",
      ticket_id: ticketId,
      text: `📋 **${ticket.id}** — ${ticket.title}\n\n需求描述：${ticket.description}\n⏱ 预估工时：${ticket.estimate}\n\n当前进度：**${stateLabel}**`,
      actions: actions,
      ts: Date.now() / 1000,
    };
    appendMessage(ticketId, descMsg);
    renderMessage(descMsg);
    scrollToBottom();
  }
}

function getActionsForState(state, ticketId) {
  const map = {
    waiting_start: [
      { label: "✅ 开始，先做 Spec 文档", action: "start_spec", ticket_id: ticketId },
      { label: "⏭ 跳过，直接开始开发", action: "start_dev", ticket_id: ticketId },
    ],
    waiting_spec_review: [
      { label: "✅ Spec 没问题，开始开发", action: "approve_spec", ticket_id: ticketId },
      { label: "✏️ 需要修改 Spec", action: "reject_spec", ticket_id: ticketId },
    ],
    waiting_pr_review: [
      { label: "✅ 代码没问题，审批通过", action: "approve_pr", ticket_id: ticketId },
    ],
    waiting_test_approval: [
      { label: "✅ 审批，开始测试", action: "approve_test", ticket_id: ticketId },
    ],
    waiting_release: [
      { label: "🚀 确认发布到生产", action: "approve_release", ticket_id: ticketId },
    ],
    done: [],
  };
  return map[state] || [];
}

async function triggerAction(action, ticketId) {
  // Show user reply
  const labels = {
    approve_spec: "✅ Spec 没问题，开始开发",
    reject_spec: "✏️ 需要修改",
    start_dev: "⏭ 跳过，直接开始开发",
    approve_pr: "✅ 代码没问题，审批通过",
    approve_test: "✅ 审批，开始测试",
    approve_release: "🚀 确认发布到生产",
    skip: "❌ 暂不处理",
  };
  const text = labels[action] || action;
  const msg = { role: "user", text, ticket_id: ticketId, ts: Date.now() / 1000 };
  appendMessage(ticketId, msg);
  if (activeTicketId === ticketId) {
    renderMessage(msg);
    scrollToBottom();
  }

  // Disable all action buttons for this message
  document.querySelectorAll(`.action-btn[data-tid="${ticketId}"]`).forEach(b => b.classList.add("done"));

  await fetch(`/api/action/${ticketId}/${action}`, { method: "POST" });
}

// ── Render ─────────────────────────────────────────────────────────────────────
function renderChat(ticketId) {
  const container = document.getElementById("messages");
  container.innerHTML = "";

  const thread = chatThreads[ticketId] || { messages: [] };
  thread.messages.forEach(msg => renderMessage(msg, false));
  scrollToBottom();

  // Typing
  const tr = document.getElementById("typing-row");
  if (tr) tr.style.display = typingTickets.has(ticketId) ? "flex" : "none";

  // Info panel
  updateInfoPanel(ticketId);
  const state = workflowStates[ticketId];
  renderSteps(state?.step_number || 0);
}

function renderMessage(msg, animate = true) {
  const container = document.getElementById("messages");
  if (!container) return;

  if (msg.type === "system") {
    const el = document.createElement("div");
    el.className = "system-event";
    el.textContent = msg.text;
    container.appendChild(el);
    return;
  }

  const row = document.createElement("div");
  row.className = `msg-row ${msg.role}`;

  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  avatar.textContent = msg.role === "bot" ? "🤖" : (msg.role === "user" ? "👨‍💻" : "⚙️");

  const content = document.createElement("div");
  content.className = "msg-content";

  const bubble = document.createElement("div");
  bubble.className = `bubble ${msg.role}`;
  bubble.innerHTML = markdownLight(msg.text);

  content.appendChild(bubble);

  // Action buttons
  if (msg.actions && msg.actions.length > 0) {
    const btns = document.createElement("div");
    btns.className = "action-buttons";
    msg.actions.forEach(act => {
      const btn = document.createElement("button");
      btn.className = "action-btn";
      btn.textContent = act.label;
      btn.dataset.tid = act.ticket_id;
      btn.onclick = () => triggerAction(act.action, act.ticket_id);
      btns.appendChild(btn);
    });
    content.appendChild(btns);
  }

  row.appendChild(avatar);
  row.appendChild(content);

  container.appendChild(row);
}

function appendMessage(ticketId, msg) {
  if (!chatThreads[ticketId]) chatThreads[ticketId] = { messages: [] };
  chatThreads[ticketId].messages.push(msg);
}

function scrollToBottom() {
  const container = document.getElementById("messages");
  if (container) container.scrollTop = container.scrollHeight;
}

// ── Tabs ───────────────────────────────────────────────────────────────────────
function addChatTab(ticketId, title) {
  const tabs = document.getElementById("chat-tabs");
  if (document.querySelector(`.chat-tab[data-tid="${ticketId}"]`)) return;

  const tab = document.createElement("button");
  tab.className = "chat-tab";
  tab.dataset.tid = ticketId;
  tab.textContent = ticketId;
  tab.title = title;
  tab.onclick = () => switchChatTab(ticketId);
  tabs.appendChild(tab);
}

function switchChatTab(ticketId) {
  activeTicketId = ticketId;
  document.querySelectorAll(".chat-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tid === ticketId);
    if (t.dataset.tid === ticketId) t.style.borderColor = "";
  });
  document.querySelectorAll(".ticket-card").forEach(c => {
    c.classList.toggle("active", c.dataset.tid === ticketId);
  });

  const title = document.getElementById("chat-title");
  const subtitle = document.getElementById("chat-subtitle");
  if (ticketId === "__global__") {
    title.textContent = "Dev 助手";
    subtitle.textContent = "与 Bot 对话";
  } else {
    const ticket = window.__tickets.find(t => t.id === ticketId);
    title.textContent = ticketId;
    subtitle.textContent = ticket?.title || "";
  }

  renderChat(ticketId);
}

// ── Steps panel ───────────────────────────────────────────────────────────────
function renderSteps(currentStep = 0) {
  const list = document.getElementById("step-list");
  if (!list) return;
  list.innerHTML = "";
  STEPS.forEach(step => {
    const li = document.createElement("div");
    let cls = "pending";
    if (step.num === currentStep) cls = "active";
    else if (step.num < currentStep) cls = "done";
    li.className = `step-item ${cls}`;

    const num = document.createElement("div");
    num.className = `step-num ${cls}`;
    num.textContent = cls === "done" ? "✓" : step.num;

    const label = document.createElement("span");
    label.textContent = step.label;

    li.appendChild(num);
    li.appendChild(label);
    list.appendChild(li);
  });
}

// ── Ticket cards ──────────────────────────────────────────────────────────────
function renderTicketList(tickets) {
  window.__tickets = tickets;
  const list = document.getElementById("ticket-list");
  list.innerHTML = "";
  tickets.forEach(ticket => {
    const card = document.createElement("div");
    card.className = "ticket-card";
    card.dataset.tid = ticket.id;
    card.onclick = () => selectTicket(ticket.id);

    const prioClass = { High: "badge-high", Medium: "badge-medium", Low: "badge-low" }[ticket.priority] || "badge-low";

    card.innerHTML = `
      <div class="ticket-id">${ticket.id}</div>
      <div class="ticket-title">${ticket.title}</div>
      <div class="ticket-meta">
        <span class="badge ${prioClass}">${ticket.priority}</span>
        <span class="badge badge-est">${ticket.estimate}</span>
      </div>
      <div class="ticket-state" id="state-${ticket.id}">待处理</div>
      <div class="ticket-step">
        <div class="step-bar"><div class="step-fill" id="bar-${ticket.id}" style="width:0%"></div></div>
      </div>
    `;
    list.appendChild(card);
  });
}

function updateTicketCard(ticketId) {
  const state = workflowStates[ticketId];
  if (!state) return;
  const el = document.getElementById(`state-${ticketId}`);
  const bar = document.getElementById(`bar-${ticketId}`);
  if (el) el.textContent = state.state_label || "";
  if (bar) {
    const pct = Math.round((state.step_number / 12) * 100);
    bar.style.width = pct + "%";
  }
}

// ── Info panel ─────────────────────────────────────────────────────────────────
function updateInfoPanel(ticketId) {
  const panel = document.getElementById("info-panel");
  if (!panel) return;
  const state = workflowStates[ticketId];
  if (!state || ticketId === "__global__") {
    panel.innerHTML = `<div style="color:var(--text-dim);font-size:13px">选择一个 Ticket 查看详情</div>`;
    return;
  }
  const ticket = (window.__tickets || []).find(t => t.id === ticketId);
  panel.innerHTML = `
    <div class="info-section">
      <div class="info-title">任务信息</div>
      <div class="info-row">
        <div class="info-label">Ticket</div>
        <div class="info-value">${ticketId} — ${ticket?.title || ""}</div>
      </div>
      <div class="info-row">
        <div class="info-label">当前阶段</div>
        <div class="info-value" style="color:var(--accent)">${state.state_label || "—"}</div>
      </div>
      ${state.branch_name ? `<div class="info-row"><div class="info-label">Git 分支</div><div class="info-value"><code>${state.branch_name}</code></div></div>` : ""}
      ${state.spec_url ? `<div class="info-row"><div class="info-label">Spec 文档</div><div class="info-value"><a href="${state.spec_url}" target="_blank">查看 →</a></div></div>` : ""}
      ${state.pr_url ? `<div class="info-row"><div class="info-label">Pull Request</div><div class="info-value"><a href="${state.pr_url}" target="_blank">查看 PR →</a></div></div>` : ""}
      ${state.test_env_url ? `<div class="info-row"><div class="info-label">测试环境</div><div class="info-value"><a href="${state.test_env_url}" target="_blank">${state.test_env_url}</a></div></div>` : ""}
    </div>
  `;
}

// ── Role switcher ─────────────────────────────────────────────────────────────
function initRoleSwitcher() {
  document.querySelectorAll(".role-btn").forEach(btn => {
    btn.onclick = () => {
      currentRole = btn.dataset.role;
      document.querySelectorAll(".role-btn").forEach(b => b.classList.toggle("active", b.dataset.role === currentRole));
      // Show/hide role notification banner
      const notifs = roleNotifications[currentRole] || [];
      const latest = notifs[notifs.length - 1];
      if (latest) showRoleNotificationBanner(latest);
      else hideRoleNotificationBanner();
    };
  });
}

function showRoleNotificationBanner(msg) {
  const banner = document.getElementById("role-banner");
  if (!banner) return;
  const roleLabel = { tester: "小B (Tester)", release: "小C (Release)" }[msg.role] || msg.role;
  banner.innerHTML = `
    <div class="role-banner-title">📬 ${roleLabel} 收到通知 — ${msg.ticket_id}</div>
    <div style="font-size:13px;margin-bottom:8px">${markdownLight(msg.text)}</div>
    ${(msg.actions || []).map(a =>
      `<button class="action-btn" onclick="triggerAction('${a.action}', '${a.ticket_id}')">${a.label}</button>`
    ).join(" ")}
  `;
  banner.classList.add("show");
}

function hideRoleNotificationBanner() {
  const banner = document.getElementById("role-banner");
  if (banner) banner.classList.remove("show");
}

// ── Markdown light parser ─────────────────────────────────────────────────────
function markdownLight(text) {
  if (!text) return "";
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/\n/g, "<br>");
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
(async () => {
  const res = await fetch("/api/start_session");
  const data = await res.json();
  renderTicketList(data.tickets);
})();

// Dev Workflow Bot Demo — 三人独立视角

const STEPS = [
  { num: 1,  label: "打开 Bot，查看 Jira" },
  { num: 2,  label: "选择任务" },
  { num: 3,  label: "生成技术规范 Spec" },
  { num: 4,  label: "Dev 审批，下令开发" },
  { num: 5,  label: "并行任务" },
  { num: 6,  label: "Bot 自动 Code Review" },
  { num: 7,  label: "Dev 审批 PR" },
  { num: 8,  label: "部署测试环境 & 通知小B" },
  { num: 9,  label: "小B 审批，开始测试" },
  { num: 10, label: "测试完成，通知小B" },
  { num: 11, label: "触发发布，通知小C" },
  { num: 12, label: "小C 发布到生产" },
];

// ── State ────────────────────────────────────────────────────────────────────
let ws = null;
let currentPerson = "a";

// Per-person state
const personState = {
  a: { activeTid: "__global__", threads: { "__global__": [] }, typing: new Set() },
  b: { activeTid: "__b_global__", threads: { "__b_global__": [] }, typing: new Set() },
  c: { activeTid: "__c_global__", threads: { "__c_global__": [] }, typing: new Set() },
};

// Workflow states (ticket_id -> state info)
const workflowStates = {};

// Badges
const badges = { a: 0, b: 0, c: 0 };

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  connectWS();
  renderSteps("a", 0);

  // Load tickets and greeting
  const res = await fetch("/api/start_session");
  const data = await res.json();
  window.__tickets = data.tickets;
  renderTicketList(data.tickets);
  showBotMsg("a", "__global__", data.message);
});

// ── WebSocket ─────────────────────────────────────────────────────────────────
function connectWS() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onmessage = (e) => handleMsg(JSON.parse(e.data));
  ws.onclose = () => setTimeout(connectWS, 2000);
}

function handleMsg(msg) {
  switch (msg.type) {
    case "chat":    handleChatMsg(msg); break;
    case "system":  handleSystemMsg(msg); break;
    case "typing":  handleTyping(msg); break;
    case "workflow_update": handleWorkflowUpdate(msg); break;
    case "role_notification": handleRoleNotification(msg); break;
  }
}

// Chat msg goes to 小A (dev)
function handleChatMsg(msg) {
  const tid = msg.ticket_id || "__global__";
  appendToThread("a", tid, msg);
  if (currentPerson === "a" && personState.a.activeTid === tid) {
    renderMsgEl("a", msg);
    scrollBottom("a");
  } else if (currentPerson !== "a" || personState.a.activeTid !== tid) {
    addBadge("a");
    markTabNotify("a", tid);
  }
}

function handleSystemMsg(msg) {
  const tid = msg.ticket_id || "__global__";
  appendToThread("a", tid, msg);
  if (currentPerson === "a" && personState.a.activeTid === tid) {
    renderMsgEl("a", msg);
    scrollBottom("a");
  }
}

function handleTyping(msg) {
  const tid = msg.ticket_id || "__global__";
  if (msg.show) personState.a.typing.add(tid);
  else personState.a.typing.delete(tid);
  if (currentPerson === "a" && personState.a.activeTid === tid) {
    const el = document.getElementById("typing-row-a");
    if (el) el.style.display = msg.show ? "flex" : "none";
  }
}

function handleWorkflowUpdate(msg) {
  workflowStates[msg.ticket_id] = msg;
  updateTicketCard(msg.ticket_id);
  if (currentPerson === "a" && personState.a.activeTid === msg.ticket_id) {
    renderSteps("a", msg.step_number);
    updateInfoPanel("a", msg.ticket_id);
  }
}

// Role notifications → 小B or 小C
function handleRoleNotification(msg) {
  const person = msg.role === "tester" ? "b" : msg.role === "release" ? "c" : null;
  if (!person) return;

  const tid = `${person}_${msg.ticket_id}`;
  const ps = personState[person];
  if (!ps.threads[tid]) ps.threads[tid] = [];

  // Create bot message with actions
  const botMsg = {
    type: "chat",
    role: "bot",
    ticket_id: tid,
    text: msg.text,
    actions: msg.actions,
    ts: Date.now() / 1000,
  };
  appendToThread(person, tid, botMsg);

  // Always switch this person's active thread to the new notification
  ps.activeTid = tid;

  // Add to this person's queue sidebar
  addQueueCard(person, msg.ticket_id, msg);

  // Add tab for this ticket
  addPersonTab(person, tid, msg.ticket_id);

  // If currently viewing this person, render immediately
  if (currentPerson === person) {
    switchPersonChatTab(person, tid);
  } else {
    // Badge the tab so they know a message arrived
    addBadge(person);
  }

  // Update right panel for 小B/小C
  updateRoleInfoPanel(person, msg);
}

// ── Person tabs ───────────────────────────────────────────────────────────────
function switchPerson(p) {
  currentPerson = p;
  document.querySelectorAll(".person-tab").forEach(t =>
    t.classList.toggle("active", t.dataset.person === p)
  );
  document.querySelectorAll(".person-panel").forEach(panel =>
    panel.classList.toggle("active", panel.id === `panel-${p}`)
  );
  // Re-render current chat thread for this person
  const tid = personState[p].activeTid;
  const container = document.getElementById(`messages-${p}`);
  if (container && tid) {
    // Only re-render if there are real messages (skip initial empty state)
    const thread = personState[p].threads[tid] || [];
    if (thread.length > 0) {
      container.innerHTML = "";
      thread.forEach(m => renderMsgEl(p, m, false));
      scrollBottom(p);
    }
    // Sync active tab highlight
    document.querySelectorAll(`#chat-tabs-${p} .chat-tab`).forEach(t =>
      t.classList.toggle("active", t.dataset.tid === tid)
    );
  }
  // Clear badge for this person
  clearBadge(p);
}

// ── Chat tab switching (per person) ──────────────────────────────────────────
function switchChatTab(person, tid) {
  switchPersonChatTab(person, tid);
}

function switchPersonChatTab(person, tid) {
  personState[person].activeTid = tid;
  document.querySelectorAll(`#chat-tabs-${person} .chat-tab`).forEach(t => {
    t.classList.toggle("active", t.dataset.tid === tid);
    if (t.dataset.tid === tid) t.classList.remove("notify");
  });

  // Update header
  const titleEl = document.getElementById(`chat-title-${person}`);
  const subtitleEl = document.getElementById(`chat-subtitle-${person}`);
  if (person === "a") {
    if (tid === "__global__") {
      if (titleEl) titleEl.textContent = "Dev 助手";
      if (subtitleEl) subtitleEl.textContent = "点击左侧任务开始";
    } else {
      const ticket = (window.__tickets || []).find(t => t.id === tid);
      if (titleEl) titleEl.textContent = tid;
      if (subtitleEl) subtitleEl.textContent = ticket?.title || "";
    }
  }

  // Render chat
  const container = document.getElementById(`messages-${person}`);
  if (container) {
    container.innerHTML = "";
    const thread = personState[person].threads[tid] || [];
    thread.forEach(m => renderMsgEl(person, m, false));
    scrollBottom(person);
  }

  // Typing
  const tr = document.getElementById(`typing-row-${person}`);
  if (tr) tr.style.display = personState[person].typing.has(tid) ? "flex" : "none";

  // Update right panels
  if (person === "a") {
    const state = workflowStates[tid];
    renderSteps("a", state?.step_number || 0);
    updateInfoPanel("a", tid);
  }
}

function addPersonTab(person, tid, label) {
  const container = document.getElementById(`chat-tabs-${person}`);
  if (!container || container.querySelector(`[data-tid="${tid}"]`)) return;
  const btn = document.createElement("button");
  btn.className = "chat-tab";
  btn.dataset.tid = tid;
  btn.textContent = label;
  btn.onclick = () => switchPersonChatTab(person, tid);
  container.appendChild(btn);
}

function markTabNotify(person, tid) {
  const tab = document.querySelector(`#chat-tabs-${person} .chat-tab[data-tid="${tid}"]`);
  if (tab && !tab.classList.contains("active")) tab.classList.add("notify");
}

// ── 小A ticket interactions ───────────────────────────────────────────────────
async function selectTicket(ticketId) {
  const ticket = (window.__tickets || []).find(t => t.id === ticketId);
  if (!ticket) return;

  if (!personState.a.threads[ticketId]) personState.a.threads[ticketId] = [];
  addChatTabA(ticketId, ticket.title);
  switchPersonChatTab("a", ticketId);

  const alreadyStarted = !!workflowStates[ticketId];

  if (!alreadyStarted) {
    await fetch(`/api/select_ticket/${ticketId}`, { method: "POST" });
  } else {
    const state = workflowStates[ticketId];
    const actions = getActionsForState(state?.state, ticketId);
    const descMsg = {
      type: "chat",
      role: "bot",
      ticket_id: ticketId,
      text: `📋 **${ticket.id}** — ${ticket.title}\n\n需求描述：${ticket.description}\n⏱ 预估工时：${ticket.estimate}\n\n当前进度：**${state?.state_label || ""}**`,
      actions,
      ts: Date.now() / 1000,
    };
    appendToThread("a", ticketId, descMsg);
    renderMsgEl("a", descMsg);
    scrollBottom("a");
  }
}

function addChatTabA(ticketId, title) {
  addPersonTab("a", ticketId, ticketId);
}

async function triggerAction(action, ticketId) {
  const labels = {
    approve_spec: "✅ Spec 没问题，开始开发",
    reject_spec: "✏️ 需要修改",
    start_spec: "✅ 开始，先做 Spec 文档",
    start_dev: "⏭ 跳过，直接开始开发",
    approve_pr: "✅ 代码没问题，审批通过",
    approve_test: "✅ 审批，开始测试",
    approve_release: "🚀 确认发布到生产",
    skip: "❌ 暂不处理",
  };
  const text = labels[action] || action;

  // Determine which person is clicking
  const isTestAction = action === "approve_test";
  const isReleaseAction = action === "approve_release";
  const person = isTestAction ? "b" : isReleaseAction ? "c" : "a";
  const tid = isTestAction ? `b_${ticketId}` : isReleaseAction ? `c_${ticketId}` : ticketId;

  const userMsg = { type: "chat", role: "user", ticket_id: tid, text, ts: Date.now() / 1000 };
  appendToThread(person, tid, userMsg);
  if (currentPerson === person && personState[person].activeTid === tid) {
    renderMsgEl(person, userMsg);
    scrollBottom(person);
  }

  // Disable action buttons
  document.querySelectorAll(`.action-btn[data-action="${action}"][data-tid="${ticketId}"]`).forEach(b => b.classList.add("done"));

  await fetch(`/api/action/${ticketId}/${action}`, { method: "POST" });
}

// ── Render helpers ────────────────────────────────────────────────────────────
function appendToThread(person, tid, msg) {
  if (!personState[person].threads[tid]) personState[person].threads[tid] = [];
  personState[person].threads[tid].push(msg);
}

function showBotMsg(person, tid, text, actions) {
  const msg = { type: "chat", role: "bot", ticket_id: tid, text, actions, ts: Date.now() / 1000 };
  appendToThread(person, tid, msg);
  if (currentPerson === person && personState[person].activeTid === tid) {
    renderMsgEl(person, msg);
    scrollBottom(person);
  }
}

function renderMsgEl(person, msg, animate = true) {
  const container = document.getElementById(`messages-${person}`);
  if (!container) return;

  // Remove empty state
  const empty = container.querySelector(".empty-state-msg");
  if (empty) empty.remove();

  if (msg.type === "system") {
    const el = document.createElement("div");
    el.className = "system-event";
    el.textContent = msg.text;
    container.appendChild(el);
    return;
  }

  const row = document.createElement("div");
  row.className = `msg-row ${msg.role || "bot"}`;

  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  avatar.textContent = msg.role === "bot" ? "🤖"
    : msg.role === "user" ? (person === "a" ? "👨‍💻" : person === "b" ? "🧪" : "🚀")
    : "⚙️";

  const content = document.createElement("div");
  content.className = "msg-content";

  const bubble = document.createElement("div");
  bubble.className = `bubble ${msg.role || "bot"}`;
  bubble.innerHTML = mdLight(msg.text || "");
  content.appendChild(bubble);

  if (msg.actions && msg.actions.length > 0) {
    const btns = document.createElement("div");
    btns.className = "action-buttons";
    msg.actions.forEach(a => {
      const btn = document.createElement("button");
      btn.className = "action-btn";
      btn.textContent = a.label;
      btn.dataset.action = a.action;
      btn.dataset.tid = a.ticket_id;
      btn.onclick = () => triggerAction(a.action, a.ticket_id);
      btns.appendChild(btn);
    });
    content.appendChild(btns);
  }

  row.appendChild(avatar);
  row.appendChild(content);
  container.appendChild(row);
}

function scrollBottom(person) {
  const el = document.getElementById(`messages-${person}`);
  if (el) el.scrollTop = el.scrollHeight;
}

// ── Ticket list (小A) ─────────────────────────────────────────────────────────
function renderTicketList(tickets) {
  const list = document.getElementById("ticket-list-a");
  if (!list) return;
  list.innerHTML = "";
  tickets.forEach(t => {
    const card = document.createElement("div");
    card.className = "ticket-card";
    card.dataset.tid = t.id;
    card.onclick = () => selectTicket(t.id);
    const prioClass = { High: "badge-high", Medium: "badge-medium", Low: "badge-low" }[t.priority] || "badge-low";
    card.innerHTML = `
      <div class="ticket-id">${t.id}</div>
      <div class="ticket-title-text">${t.title}</div>
      <div class="ticket-meta">
        <span class="badge ${prioClass}">${t.priority}</span>
        <span class="badge badge-est">${t.estimate}</span>
      </div>
      <div class="ticket-state-label" id="state-${t.id}">待处理</div>
      <div class="step-bar"><div class="step-fill" id="bar-${t.id}" style="width:0%"></div></div>
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
  if (bar) bar.style.width = Math.round((state.step_number / 12) * 100) + "%";
  // highlight active card
  document.querySelectorAll(".ticket-card").forEach(c =>
    c.classList.toggle("active", c.dataset.tid === personState.a.activeTid)
  );
}

// ── Queue cards (小B / 小C) ───────────────────────────────────────────────────
function addQueueCard(person, ticketId, msg) {
  const listId = person === "b" ? "ticket-list-b" : "ticket-list-c";
  const list = document.getElementById(listId);
  if (!list) return;

  // Remove empty placeholder
  const empty = list.querySelector(".empty-queue");
  if (empty) empty.remove();

  // Don't duplicate
  if (list.querySelector(`[data-tid="${ticketId}"]`)) return;

  const tid = `${person}_${ticketId}`;
  const card = document.createElement("div");
  card.className = "queue-card new";
  card.dataset.tid = ticketId;
  card.onclick = () => switchPersonChatTab(person, tid);

  const label = person === "b" ? "🧪 测试任务" : "🚀 发布任务";
  card.innerHTML = `
    <div class="queue-title">${ticketId}</div>
    <div class="queue-sub">${label}</div>
    <div class="queue-status pending" id="qstatus-${person}-${ticketId}">⏳ 待处理</div>
  `;
  list.appendChild(card);
}

// ── Steps panel (小A) ─────────────────────────────────────────────────────────
function renderSteps(person, currentStep = 0) {
  const list = document.getElementById(`step-list-${person}`);
  if (!list) return;
  list.innerHTML = "";
  STEPS.forEach(step => {
    let cls = step.num < currentStep ? "done" : step.num === currentStep ? "active" : "pending";
    const li = document.createElement("div");
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

// ── Info panel (小A right) ────────────────────────────────────────────────────
function updateInfoPanel(person, ticketId) {
  const panel = document.getElementById(`info-panel-${person}`);
  if (!panel) return;
  const state = workflowStates[ticketId];
  if (!state || ticketId === "__global__") {
    panel.innerHTML = `<div class="panel-hint">点击左侧 Ticket 查看详情</div>`;
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

// ── Role info panel (小B / 小C right) ────────────────────────────────────────
function updateRoleInfoPanel(person, msg) {
  const panel = document.getElementById(`info-panel-${person}`);
  if (!panel) return;

  if (person === "b") {
    panel.innerHTML = `
      <div class="info-section">
        <div class="info-title">测试任务</div>
        <div class="info-row">
          <div class="info-label">Ticket</div>
          <div class="info-value">${msg.ticket_id}</div>
        </div>
        <div class="info-row">
          <div class="info-label">状态</div>
          <div class="info-value" style="color:var(--color-b)">待审批测试</div>
        </div>
        ${workflowStates[msg.ticket_id]?.test_env_url ? `
        <div class="info-row">
          <div class="info-label">测试环境</div>
          <div class="info-value"><a href="${workflowStates[msg.ticket_id].test_env_url}" target="_blank">打开 →</a></div>
        </div>` : ""}
      </div>
    `;
  } else if (person === "c") {
    panel.innerHTML = `
      <div class="info-section">
        <div class="info-title">发布任务</div>
        <div class="info-row">
          <div class="info-label">Ticket</div>
          <div class="info-value">${msg.ticket_id}</div>
        </div>
        <div class="info-row">
          <div class="info-label">状态</div>
          <div class="info-value" style="color:var(--color-c)">待确认发布</div>
        </div>
      </div>
    `;
  }
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function addBadge(person) {
  badges[person]++;
  const el = document.getElementById(`badge-${person}`);
  if (el) { el.textContent = badges[person]; el.style.display = "inline-block"; }
}

function clearBadge(person) {
  badges[person] = 0;
  const el = document.getElementById(`badge-${person}`);
  if (el) el.style.display = "none";
}

// ── Action state map ──────────────────────────────────────────────────────────
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
  };
  return map[state] || [];
}

// ── Markdown light ────────────────────────────────────────────────────────────
function mdLight(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/\n/g, "<br>");
}

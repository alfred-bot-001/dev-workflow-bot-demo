"""Workflow state machine for each ticket"""
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional
import time


class WorkflowState(str, Enum):
    IDLE = "idle"
    WAITING_START = "waiting_start"
    GENERATING_SPEC = "generating_spec"
    WAITING_SPEC_REVIEW = "waiting_spec_review"
    DEVELOPING = "developing"
    CODE_REVIEW = "code_review"
    WAITING_PR_REVIEW = "waiting_pr_review"
    DEPLOYING_TEST = "deploying_test"
    WAITING_TEST_APPROVAL = "waiting_test_approval"
    TESTING = "testing"
    WAITING_RELEASE = "waiting_release"
    RELEASING = "releasing"
    DONE = "done"


STEP_LABELS = {
    WorkflowState.IDLE: "未开始",
    WorkflowState.WAITING_START: "Step 1: 待确认",
    WorkflowState.GENERATING_SPEC: "Step 3: 生成规范中",
    WorkflowState.WAITING_SPEC_REVIEW: "Step 3: 待Review规范",
    WorkflowState.DEVELOPING: "Step 4-5: 开发中",
    WorkflowState.CODE_REVIEW: "Step 6: Bot Code Review",
    WorkflowState.WAITING_PR_REVIEW: "Step 7: 待Review PR",
    WorkflowState.DEPLOYING_TEST: "Step 8: 部署测试环境",
    WorkflowState.WAITING_TEST_APPROVAL: "Step 9: 待小B审批",
    WorkflowState.TESTING: "Step 9-10: 测试中",
    WorkflowState.WAITING_RELEASE: "Step 11: 待小C发布",
    WorkflowState.RELEASING: "Step 12: 发布中",
    WorkflowState.DONE: "✅ 完成",
}

STEP_NUMBER = {
    WorkflowState.IDLE: 0,
    WorkflowState.WAITING_START: 1,
    WorkflowState.GENERATING_SPEC: 3,
    WorkflowState.WAITING_SPEC_REVIEW: 3,
    WorkflowState.DEVELOPING: 5,
    WorkflowState.CODE_REVIEW: 6,
    WorkflowState.WAITING_PR_REVIEW: 7,
    WorkflowState.DEPLOYING_TEST: 8,
    WorkflowState.WAITING_TEST_APPROVAL: 9,
    WorkflowState.TESTING: 10,
    WorkflowState.WAITING_RELEASE: 11,
    WorkflowState.RELEASING: 12,
    WorkflowState.DONE: 12,
}


@dataclass
class TicketWorkflow:
    ticket_id: str
    ticket_title: str
    state: WorkflowState = WorkflowState.IDLE
    branch_name: Optional[str] = None
    spec_url: Optional[str] = None
    pr_url: Optional[str] = None
    test_env_url: Optional[str] = None
    started_at: Optional[float] = None
    messages: list = field(default_factory=list)

    def to_dict(self):
        return {
            "ticket_id": self.ticket_id,
            "ticket_title": self.ticket_title,
            "state": self.state.value,
            "state_label": STEP_LABELS.get(self.state, ""),
            "step_number": STEP_NUMBER.get(self.state, 0),
            "branch_name": self.branch_name,
            "spec_url": self.spec_url,
            "pr_url": self.pr_url,
            "test_env_url": self.test_env_url,
        }

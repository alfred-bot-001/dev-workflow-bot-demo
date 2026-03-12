"""Simulated bot actions with realistic delays"""
import asyncio
import random
import re


def slugify(title: str) -> str:
    title = title.lower()
    title = re.sub(r'[\s\u4e00-\u9fff]+', '-', title)
    title = re.sub(r'[^a-z0-9\-]', '', title)
    title = title.strip('-')
    return title or "feature"


async def simulate_create_branch(ticket_id: str, title: str) -> str:
    await asyncio.sleep(1.5)
    slug = slugify(title)
    branch = f"feature/{ticket_id.lower()}-{slug}"
    return branch


async def simulate_generate_spec(ticket_id: str, title: str) -> str:
    await asyncio.sleep(3)
    doc_num = random.randint(1000, 9999)
    return f"https://github.com/org/repo/blob/feature/{ticket_id.lower()}/docs/SPEC-{doc_num}.md"


async def simulate_development(ticket_id: str) -> dict:
    """Returns progress updates"""
    steps = [
        (1.0, "分析需求文档..."),
        (1.5, "搭建基础框架..."),
        (2.0, "实现核心逻辑..."),
        (1.5, "编写单元测试..."),
        (1.0, "代码格式化 & Lint 检查..."),
    ]
    return steps


async def simulate_code_review(ticket_id: str) -> dict:
    await asyncio.sleep(3)
    issues = random.randint(0, 3)
    suggestions = random.randint(2, 6)
    pr_num = random.randint(100, 999)
    return {
        "issues": issues,
        "suggestions": suggestions,
        "pr_url": f"https://github.com/org/repo/pull/{pr_num}",
        "summary": f"发现 {issues} 个问题，{suggestions} 条建议。代码质量良好，逻辑清晰。"
    }


async def simulate_deploy_test_env(ticket_id: str) -> str:
    await asyncio.sleep(3)
    env_id = ticket_id.lower().replace("-", "")
    return f"https://test-{env_id}.staging.example.com"


async def simulate_run_tests(ticket_id: str) -> dict:
    await asyncio.sleep(4)
    total = random.randint(20, 50)
    passed = total - random.randint(0, 2)
    return {
        "total": total,
        "passed": passed,
        "failed": total - passed,
        "coverage": f"{random.randint(82, 96)}%",
        "duration": f"{random.uniform(8, 25):.1f}s"
    }


async def simulate_release() -> dict:
    await asyncio.sleep(3)
    return {
        "version": f"v1.{random.randint(1, 9)}.{random.randint(0, 20)}",
        "deploy_url": "https://app.example.com",
        "duration": f"{random.randint(45, 120)}s"
    }

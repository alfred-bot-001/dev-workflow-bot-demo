"""Mock Jira tickets data"""

TICKETS = [
    {
        "id": "PROJ-101",
        "title": "用户登录页面优化",
        "description": "优化登录页面 UI，支持手机号+验证码登录，增加记住密码功能",
        "priority": "High",
        "estimate": "3d",
        "assignee": "Dev",
        "status": "To Do"
    },
    {
        "id": "PROJ-102",
        "title": "支付接口集成",
        "description": "集成 Stripe 支付网关，支持信用卡和 Apple Pay",
        "priority": "High",
        "estimate": "5d",
        "assignee": "Dev",
        "status": "To Do"
    },
    {
        "id": "PROJ-103",
        "title": "报表导出功能",
        "description": "支持导出 Excel/PDF 格式的销售报表，支持自定义时间范围",
        "priority": "Medium",
        "estimate": "2d",
        "assignee": "Dev",
        "status": "To Do"
    },
    {
        "id": "PROJ-104",
        "title": "推送通知系统",
        "description": "集成 Firebase FCM，实现订单状态推送通知",
        "priority": "Medium",
        "estimate": "4d",
        "assignee": "Dev",
        "status": "To Do"
    },
]

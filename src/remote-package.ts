import type { RemotePackage } from './reconcile';

export const sampleRemotePackage: RemotePackage = {
  id: 'design-system-2026-09-30',
  name: '设计系统规范包',
  version: '2026.09.3',
  exportedAt: '2026-09-30T09:30:00.000Z',
  components: [
    {
      id: 'button-spec',
      name: 'Action button',
      category: 'Actions',
      status: 'published',
      purpose: '触发一个明确、可立即完成的动作。',
      usage: '主操作优先使用强调样式；同一区域最多保留一个主按钮；危险动作必须补充确认。',
      states: 'default、hover、focus-visible、pressed、disabled、pending。',
      keyboardBehavior: 'Tab 聚焦，Space 或 Enter 触发。焦点环必须清晰可见。',
      screenReader: '使用原生 button；读屏应报告按钮名称、禁用状态和按下状态。',
      disabledScenarios: '不要让按钮承担跳转语义；异步提交时应禁用重复提交。',
      interactionSignature: 'Space/Enter 触发；disabled 或 pending 时不响应',
      properties: [
        {
          id: 'p-label',
          name: 'label',
          type: 'string',
          required: true,
          defaultValue: '保存',
          description: '按钮可见文字，同时作为无障碍名称。'
        },
        {
          id: 'p-disabled',
          name: 'disabled',
          type: 'boolean',
          required: false,
          defaultValue: 'false',
          description: '禁用交互，但不隐藏按钮。'
        },
        {
          id: 'p-variant',
          name: 'variant',
          type: 'accent | primary | secondary',
          required: false,
          defaultValue: 'secondary',
          description: '控制动作层级。'
        },
        {
          name: 'pending',
          type: 'boolean',
          required: false,
          defaultValue: 'false',
          description: '显示异步处理状态，并阻止重复触发。'
        }
      ]
    },
    {
      id: 'dialog-spec',
      name: 'Modal dialog',
      category: 'Feedback',
      removed: true,
      properties: []
    },
    {
      name: 'Legacy action button',
      category: 'Actions',
      status: 'review',
      purpose: '旧版动作按钮，规范包无法确认应映射到哪个本地组件。',
      usage: '仅用于迁移旧示例。',
      states: 'default、hover、disabled。',
      keyboardBehavior: 'Enter 触发。',
      screenReader: '读屏应报告按钮名称。',
      disabledScenarios: '不要在工具栏之外使用。',
      interactionSignature: 'Enter 触发',
      properties: [
        {
          name: 'label',
          type: 'string',
          required: true,
          defaultValue: '确定',
          description: '按钮文字。'
        }
      ]
    },
    {
      name: 'Inline notice',
      category: 'Feedback',
      status: 'published',
      purpose: '在当前上下文中展示非阻断式状态、提示或错误。',
      usage: '错误提示应给出可执行的恢复动作；不能替代模态确认。',
      states: 'info、success、warning、error、dismissed。',
      keyboardBehavior: '提示本身不入 Tab；关闭按钮可通过 Tab 聚焦，Enter 激活。',
      screenReader: '使用 role=status 或 role=alert，并播报语义类型与消息正文。',
      disabledScenarios: '需要用户立即决策时使用 Modal dialog。',
      interactionSignature: 'role=status/alert；关闭按钮 Enter 激活',
      properties: [
        {
          name: 'tone',
          type: 'info | success | warning | error',
          required: true,
          defaultValue: 'info',
          description: '提示语义类型。'
        },
        {
          name: 'dismissible',
          type: 'boolean',
          required: false,
          defaultValue: 'true',
          description: '是否允许用户关闭提示。'
        }
      ]
    }
  ]
};

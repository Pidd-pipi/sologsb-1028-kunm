import type { ComponentSpec, WorkspaceState } from './types';

const now = '2026-09-25T08:00:00.000Z';

const components: ComponentSpec[] = [
  {
    id: 'button-spec',
    name: 'Action button',
    category: 'Actions',
    status: 'published',
    purpose: '触发一个明确、可立即完成的动作。',
    usage: '主操作优先使用强调样式；同一区域最多保留一个主按钮。',
    properties: [
      { id: 'p-label', name: 'label', type: 'string', required: true, defaultValue: '保存', description: '按钮可见文字，同时作为无障碍名称。' },
      { id: 'p-disabled', name: 'disabled', type: 'boolean', required: false, defaultValue: 'false', description: '禁用交互，但不隐藏按钮。' },
      { id: 'p-variant', name: 'variant', type: 'accent | primary | secondary', required: false, defaultValue: 'secondary', description: '控制动作层级。' }
    ],
    states: 'default、hover、focus-visible、pressed、disabled、pending。',
    keyboardBehavior: 'Tab 聚焦，Space 或 Enter 触发。焦点环必须清晰可见。',
    screenReader: '使用原生 button；读屏应报告按钮名称、禁用状态和按下状态。',
    disabledScenarios: '不要让按钮承担跳转语义；异步提交时应禁用重复提交。',
    interactionSignature: 'Space/Enter 触发；disabled 时不响应',
    a11yGuidance: '键盘：Tab 聚焦，Space/Enter 触发。\n读屏必须暴露按钮名称、禁用和按下状态。',
    a11yStale: false,
    a11yStaleReason: '',
    examples: [
      {
        id: 'example-button-primary',
        title: '保存表单',
        code: '<sp-button variant="accent">保存</sp-button>',
        propertyIds: ['p-label', 'p-variant'],
        stale: false,
        staleReason: '',
        createdFromRevision: 3
      },
      {
        id: 'example-button-disabled',
        title: '不可用状态',
        code: '<sp-button disabled>等待校验</sp-button>',
        propertyIds: ['p-label', 'p-disabled'],
        stale: false,
        staleReason: '',
        createdFromRevision: 3
      }
    ],
    revision: 3,
    updatedAt: now,
    snapshots: []
  },
  {
    id: 'field-spec',
    name: 'Labelled field',
    category: 'Forms',
    status: 'review',
    purpose: '收集单行文本，并始终向所有用户暴露字段名称。',
    usage: '标签放在输入框上方；帮助文本解释格式，错误文本说明修复方式。',
    properties: [
      { id: 'p-field-label', name: 'label', type: 'string', required: true, defaultValue: '组件名称', description: '字段可见标签，并关联输入框。' },
      { id: 'p-field-required', name: 'required', type: 'boolean', required: false, defaultValue: 'false', description: '标记必填；提交后再显示错误。' },
      { id: 'p-field-help', name: 'helpText', type: 'string', required: false, defaultValue: '', description: '输入前帮助信息。' }
    ],
    states: 'empty、filled、focus-visible、invalid、disabled、read-only。',
    keyboardBehavior: 'Tab 进入和离开，文本编辑沿用平台按键。',
    screenReader: 'label 与 input 使用 for/id 关联，errorText 通过 aria-describedby 暴露。',
    disabledScenarios: '短枚举选项不应使用文本框。',
    interactionSignature: 'Tab 聚焦；invalid 时 aria-invalid=true',
    a11yGuidance: '键盘：Tab 聚焦。\n读屏必须暴露 label、required 与 invalid 状态。',
    a11yStale: false,
    a11yStaleReason: '',
    examples: [
      {
        id: 'example-field-default',
        title: '必填组件名称',
        code: '<sp-field-label for="name">组件名称</sp-field-label>\n<sp-textfield id="name" required></sp-textfield>',
        propertyIds: ['p-field-label', 'p-field-required'],
        stale: false,
        staleReason: '',
        createdFromRevision: 2
      }
    ],
    revision: 2,
    updatedAt: now,
    snapshots: []
  },
  {
    id: 'dialog-spec',
    name: 'Modal dialog',
    category: 'Feedback',
    status: 'draft',
    purpose: '在不离开当前上下文的情况下完成一段有边界的任务。',
    usage: '仅在用户必须处理内容时使用；关闭后恢复触发元素焦点。',
    properties: [
      { id: 'p-dialog-open', name: 'open', type: 'boolean', required: true, defaultValue: 'false', description: '控制对话框可见性。' },
      { id: 'p-dialog-title', name: 'heading', type: 'string', required: true, defaultValue: '确认操作', description: '对话框标题，同时作为无障碍名称。' },
      { id: 'p-dialog-modal', name: 'modal', type: 'boolean', required: false, defaultValue: 'true', description: '是否阻止背景交互。' }
    ],
    states: 'closed、opening、open、closing、error。',
    keyboardBehavior: 'Esc 关闭；Tab 在对话框内部循环；打开后聚焦首项。',
    screenReader: 'role=dialog、aria-modal=true，并在打开后播报标题。',
    disabledScenarios: '简单信息不要打断流程；不要嵌套模态对话框。',
    interactionSignature: 'Esc 关闭；Tab 焦点循环',
    a11yGuidance: '键盘：Esc 关闭，Tab 循环焦点。\n读屏必须播报 dialog、标题与 modal 状态。',
    a11yStale: false,
    a11yStaleReason: '',
    examples: [
      {
        id: 'example-dialog-modal',
        title: '删除确认',
        code: '<sp-dialog open modal heading="删除组件？">\n  <sp-button slot="button" variant="negative">删除</sp-button>\n</sp-dialog>',
        propertyIds: ['p-dialog-open', 'p-dialog-title', 'p-dialog-modal'],
        stale: true,
        staleReason: '交互签名较上版发生变化，请确认焦点恢复与 Esc 行为。',
        createdFromRevision: 1
      }
    ],
    revision: 2,
    updatedAt: now,
    snapshots: []
  },
  {
    id: 'legacy-action-button',
    name: 'Legacy action button',
    category: 'Actions',
    status: 'draft',
    purpose: '旧版动作按钮的本地迁移草稿。',
    usage: '仅用于旧页面迁移，不建议用于新设计。',
    properties: [
      { id: 'p-legacy-label', name: 'label', type: 'string', required: true, defaultValue: '确定', description: '按钮文字。' }
    ],
    states: 'default、hover、disabled。',
    keyboardBehavior: 'Enter 触发。',
    screenReader: '读屏应报告按钮名称。',
    disabledScenarios: '不要在新工具栏中使用。',
    interactionSignature: 'Enter 触发',
    a11yGuidance: '键盘：Enter 触发。\n读屏必须暴露按钮名称。',
    a11yStale: false,
    a11yStaleReason: '',
    examples: [],
    revision: 1,
    updatedAt: now,
    snapshots: []
  },
  {
    id: 'legacy-action-button-v2',
    name: 'Legacy action button',
    category: 'Actions',
    status: 'review',
    purpose: '旧版动作按钮的第二份本地实验草稿。',
    usage: '用于验证新 token，尚未与规范仓标识对齐。',
    properties: [
      { id: 'p-legacy-label-v2', name: 'label', type: 'string', required: true, defaultValue: '继续', description: '按钮文字。' }
    ],
    states: 'default、hover、disabled。',
    keyboardBehavior: 'Enter 或 Space 触发。',
    screenReader: '读屏应报告按钮名称和操作状态。',
    disabledScenarios: '仅在迁移页面中使用。',
    interactionSignature: 'Enter/Space 触发',
    a11yGuidance: '键盘：Enter/Space 触发。\n读屏必须暴露按钮名称。',
    a11yStale: false,
    a11yStaleReason: '',
    examples: [],
    revision: 1,
    updatedAt: now,
    snapshots: []
  }
];

const componentBaseline = (component: ComponentSpec) => ({
  componentId: component.id,
  updatedAt: component.updatedAt,
  storedAt: now,
  fields: {
    name: component.name,
    category: component.category,
    status: component.status,
    purpose: component.purpose,
    usage: component.usage,
    states: component.states,
    keyboardBehavior: component.keyboardBehavior,
    screenReader: component.screenReader,
    disabledScenarios: component.disabledScenarios,
    interactionSignature: component.interactionSignature
  },
  properties: component.properties.map(({ id, name, type, required, defaultValue, description }) => ({
    id, name, type, required, defaultValue, description
  }))
});

const syncBaselines = components.map(componentBaseline);
const dialogBaseline = syncBaselines.find((item) => item.componentId === 'dialog-spec');
if (dialogBaseline) {
  dialogBaseline.updatedAt = '2026-09-20T08:00:00.000Z';
  dialogBaseline.storedAt = '2026-09-20T08:00:00.000Z';
}

export const createInitialState = (): WorkspaceState => ({
  components: structuredClone(components),
  archivedComponents: [],
  selectedId: components[0].id,
  syncBaselines: syncBaselines,
  pendingReleases: [],
  lastSyncAt: now,
  reconciliationSessions: []
});

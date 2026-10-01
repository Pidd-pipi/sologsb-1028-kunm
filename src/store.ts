import { BUILTIN_PACKAGE, applyRelease as applyReleaseLogic, buildSession, recomputeA11y as recomputeA11yLogic } from './reconcile';
import { createInitialState } from './data';
import type { ComponentSnapshot, ComponentSpec, ReconcileSession, SpecPackage, ValidationIssue, WorkspaceState } from './types';

const WORKSPACE_KEY = 'sologsb-1028-workspace-v1';
const SESSION_KEY = 'sologsb-1028-reconcile-v1';

const clone = <T>(value: T): T => structuredClone(value);
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const signature = (component: ComponentSpec) => `${component.properties.map((item) => `${item.name}:${item.required}`).join('|')}::${component.interactionSignature}`;

export class SpecStore extends EventTarget {
  state: WorkspaceState;
  reconcileSession: ReconcileSession | null = null;
  lastError = '';
  private undoStack: WorkspaceState[] = [];
  private redoStack: WorkspaceState[] = [];
  private lastAction = '';

  constructor() {
    super();
    this.state = this.loadWorkspace();
    this.reconcileSession = this.loadSession();
  }

  get selected(): ComponentSpec | undefined {
    return this.state.components.find((item) => item.id === this.state.selectedId);
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  get lastUndoLabel() { return this.lastAction; }
  get pendingCandidates(): number {
    return this.reconcileSession?.status === 'in-progress'
      ? this.reconcileSession.candidates.filter((item) => item.status === 'pending').length
      : 0;
  }

  clearError() { this.lastError = ''; }

  select(id: string) {
    if (!this.state.components.some((item) => item.id === id)) return;
    const previous = this.state;
    this.state = { ...this.state, selectedId: id };
    if (!this.persistState(this.state)) {
      this.state = previous;
    }
    this.emit();
  }

  addComponent() {
    const id = uid('component');
    const component: ComponentSpec = {
      id,
      name: 'Untitled component',
      category: 'Uncategorised',
      status: 'draft',
      purpose: '说明该组件解决的用户问题。',
      usage: '说明何时使用、何时不要使用。',
      properties: [],
      states: 'default、hover、focus-visible、disabled。',
      keyboardBehavior: '记录 Tab、Enter、Space、方向键和 Esc 等行为。',
      screenReader: '记录角色、名称、状态和动态播报。',
      disabledScenarios: '记录不应使用该组件的场景。',
      interactionSignature: '',
      examples: [],
      revision: 1,
      updatedAt: new Date().toISOString(),
      snapshots: [],
      a11yStale: false,
      a11yStaleReason: ''
    };
    this.commit('新建组件', (state) => {
      state.components.unshift(component);
      state.selectedId = id;
    });
  }

  updateComponent(patch: Partial<ComponentSpec>, markExamplesStale = false) {
    const selected = this.selected;
    if (!selected) return;
    this.commit('编辑组件', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      if (!target) return;
      Object.assign(target, patch, { updatedAt: new Date().toISOString() });
      if (markExamplesStale) {
        target.examples.forEach((example) => {
          example.stale = true;
          example.staleReason = '组件交互或属性契约已修改，示例需要重新验证。';
        });
      }
    });
  }

  addProperty() {
    const selected = this.selected;
    if (!selected) return;
    this.commit('新增属性', (state) => {
      state.components.find((item) => item.id === selected.id)?.properties.push({
        id: uid('property'),
        name: 'newProperty',
        type: 'string',
        required: false,
        defaultValue: '',
        description: '描述该属性对开发者和用户的影响。'
      });
    });
  }

  updateProperty(propertyId: string, patch: Partial<ComponentSpec['properties'][number]>) {
    const selected = this.selected;
    if (!selected) return;
    this.commit('编辑属性', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      const property = target?.properties.find((item) => item.id === propertyId);
      if (target && property) Object.assign(property, patch);
    });
  }

  removeProperty(propertyId: string) {
    const selected = this.selected;
    if (!selected) return;
    this.commit('删除属性', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      const property = target?.properties.find((item) => item.id === propertyId);
      if (!target || !property) return;
      target.properties = target.properties.filter((item) => item.id !== propertyId);
      target.examples.forEach((example) => {
        if (example.propertyIds.includes(propertyId) || example.code.includes(property.name)) {
          example.stale = true;
          example.staleReason = `属性 ${property.name} 已删除，示例代码或说明仍可能引用它。`;
        }
      });
    });
  }

  addExample() {
    const selected = this.selected;
    if (!selected) return;
    const exampleId = uid('example');
    this.commit('新增示例', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      if (!target) return;
      target.examples.push({
        id: exampleId,
        title: '新示例',
        code: `<${target.name.toLowerCase().replaceAll(' ', '-')}>示例</${target.name.toLowerCase().replaceAll(' ', '-')}>`,
        propertyIds: [],
        stale: false,
        staleReason: '',
        createdFromRevision: target.revision
      });
    });
  }

  updateExample(exampleId: string, patch: Partial<ComponentSpec['examples'][number]>) {
    const selected = this.selected;
    if (!selected) return;
    this.commit('编辑示例', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      const example = target?.examples.find((item) => item.id === exampleId);
      if (example) Object.assign(example, patch);
    });
  }

  removeExample(exampleId: string) {
    const selected = this.selected;
    if (!selected) return;
    this.commit('删除示例', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      if (target) target.examples = target.examples.filter((item) => item.id !== exampleId);
    });
  }

  createSnapshot(reason = '手动版本') {
    const selected = this.selected;
    if (!selected) return;
    this.commit('创建版本快照', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      if (!target) return;
      const { snapshots: _ignored, ...component } = clone(target);
      const nextRevision = target.revision + 1;
      const snapshot: ComponentSnapshot = {
        revision: target.revision,
        savedAt: new Date().toISOString(),
        reason,
        component: { ...component, revision: target.revision }
      };
      target.snapshots.unshift(snapshot);
      target.snapshots = target.snapshots.slice(0, 12);
      target.revision = nextRevision;
      target.updatedAt = new Date().toISOString();
    });
  }

  migrateExamples() {
    const selected = this.selected;
    if (!selected) return;
    this.commit('迁移示例到当前版本', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      if (!target) return;
      const currentSignature = signature(target);
      const activePropertyIds = new Set(target.properties.map((item) => item.id));
      target.examples.forEach((example) => {
        example.propertyIds = example.propertyIds.filter((id) => activePropertyIds.has(id));
        example.stale = false;
        example.staleReason = '';
        example.createdFromRevision = target.revision;
      });
      target.interactionSignature = currentSignature.split('::')[1] ?? target.interactionSignature;
      target.revision += 1;
      target.updatedAt = new Date().toISOString();
    });
  }

  recomputeA11y(componentId: string) {
    const target = this.state.components.find((item) => item.id === componentId);
    if (!target) return;
    this.commit('重新核算无障碍说明', (state) => {
      const current = state.components.find((item) => item.id === componentId);
      if (current) Object.assign(current, recomputeA11yLogic(current));
    });
  }

  /* ---------------- 跨仓对账 ---------------- */

  loadBuiltinPackage() {
    this.loadReconcilePackage(BUILTIN_PACKAGE);
  }

  loadReconcilePackage(pkg: SpecPackage) {
    this.reconcileSession = buildSession(pkg, this.state.components, (component) => this.baselineOf(component));
    this.persistSession();
    this.emit();
  }

  adjudicate(candidateId: string, decision: string) {
    if (!this.reconcileSession) return;
    const candidate = this.reconcileSession.candidates.find((item) => item.id === candidateId);
    if (!candidate) return;
    candidate.decision = decision;
    candidate.status = 'decided';
    this.persistSession();
    this.emit();
  }

  discardReconcile() {
    this.reconcileSession = null;
    this.persistSession();
    this.emit();
  }

  /** 应用所有裁定，生成待发布版本。事务性：超容量整批拒绝，工作区回滚。 */
  applyRelease(): boolean {
    if (!this.reconcileSession || this.reconcileSession.status !== 'in-progress') return false;
    if (this.reconcileSession.candidates.some((item) => item.status === 'pending')) {
      this.lastError = '还有候选未裁定，不能发布。';
      this.emit();
      return false;
    }

    const result = applyReleaseLogic(this.reconcileSession, this.state.components, (component) => this.baselineOf(component));
    const before = clone(this.state);
    const next: WorkspaceState = { ...this.state, components: result.components };

    if (!this.persistState(next)) {
      this.state = before;
      this.emit();
      return false;
    }

    this.undoStack.push(before);
    this.undoStack = this.undoStack.slice(-40);
    this.redoStack = [];
    this.lastAction = '对账发布';
    this.state = next;

    this.reconcileSession.status = 'released';
    this.reconcileSession.releasedAt = new Date().toISOString();
    this.reconcileSession.releaseSummary = `更新 ${result.summary.updated} 个组件，新增 ${result.summary.added} 个；属性 +${result.summary.propertiesAdded}/-${result.summary.propertiesRemoved}/~${result.summary.propertiesModified}；${result.summary.examplesInvalidated} 个示例、${result.summary.a11yInvalidated} 份无障碍说明已失效重算。`;
    this.persistSession();
    this.emit();
    return true;
  }

  /** 最近一次发布基线：优先快照，其次内置初始数据，再次为空。 */
  private baselineOf(component: ComponentSpec): ComponentSpec | null {
    if (component.snapshots.length) return component.snapshots[0].component as ComponentSpec;
    const initial = createInitialState().components.find((item) => item.id === component.id);
    return initial ?? null;
  }

  validate(): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    for (const component of this.state.components) {
      const names = new Map<string, number>();
      component.properties.forEach((property) => names.set(property.name.trim(), (names.get(property.name.trim()) ?? 0) + 1));
      for (const [name, count] of names) {
        if (name && count > 1) {
          issues.push({ id: `${component.id}-duplicate-${name}`, level: 'error', componentId: component.id, target: component.name, message: `属性名称 ${name} 重复。`, field: 'properties' });
        }
      }
      const contractChanged = component.examples.some((example) => example.createdFromRevision < component.revision);
      component.examples.forEach((example) => {
        const missingReferences = example.propertyIds.filter((id) => !component.properties.some((property) => property.id === id));
        if (example.stale || missingReferences.length) {
          issues.push({ id: `${component.id}-${example.id}-stale`, level: 'warning', componentId: component.id, target: example.title, message: example.staleReason || '示例引用了已删除属性。', field: 'examples' });
        }
        if (!example.code.trim()) {
          issues.push({ id: `${component.id}-${example.id}-empty`, level: 'error', componentId: component.id, target: example.title, message: '示例代码不能为空。', field: 'examples' });
        }
      });
      if (!component.keyboardBehavior.trim()) {
        issues.push({ id: `${component.id}-keyboard`, level: 'error', componentId: component.id, target: component.name, message: '缺少键盘行为说明。', field: 'keyboard' });
      }
      if (!component.screenReader.trim()) {
        issues.push({ id: `${component.id}-screenreader`, level: 'error', componentId: component.id, target: component.name, message: '缺少读屏说明。', field: 'screenReader' });
      }
      if (contractChanged && component.examples.length) {
        issues.push({ id: `${component.id}-contract`, level: 'info', componentId: component.id, target: component.name, message: '属性契约或交互签名发生变化，建议创建快照并迁移示例。', field: 'properties' });
      }
      if (component.a11yStale) {
        issues.push({ id: `${component.id}-a11y`, level: 'warning', componentId: component.id, target: component.name, message: component.a11yStaleReason || '无障碍说明可能失效。', field: 'screenReader' });
      }
    }
    return issues;
  }

  undo() {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(clone(this.state));
    this.state = previous;
    this.persistState(this.state);
    this.emit();
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(clone(this.state));
    this.state = next;
    this.persistState(this.state);
    this.emit();
  }

  reset() {
    this.undoStack = [];
    this.redoStack = [];
    this.state = createInitialState();
    this.persistState(this.state);
    this.emit();
  }

  private commit(label: string, mutator: (state: WorkspaceState) => void) {
    const before = clone(this.state);
    const next = clone(this.state);
    mutator(next);
    if (!this.persistState(next)) {
      this.state = before;
      this.emit();
      return;
    }
    this.undoStack.push(before);
    this.undoStack = this.undoStack.slice(-40);
    this.redoStack = [];
    this.lastAction = label;
    this.state = next;
    this.emit();
  }

  /** 事务性写入：超容量或写入失败返回 false，调用方负责回滚内存状态。 */
  private persistState(state: WorkspaceState): boolean {
    try {
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      this.lastError = error instanceof DOMException && error.name === 'QuotaExceededError'
        ? '本地存储容量不足，整批写入已拒绝，原有工作区未改动。'
        : '写入本地存储失败，原有工作区未改动。';
      return false;
    }
  }

  private persistSession(): boolean {
    try {
      if (this.reconcileSession) localStorage.setItem(SESSION_KEY, JSON.stringify(this.reconcileSession));
      else localStorage.removeItem(SESSION_KEY);
      return true;
    } catch {
      this.lastError = '对账进度写入本地存储失败，原有工作区未改动。';
      return false;
    }
  }

  private loadWorkspace(): WorkspaceState {
    try {
      const saved = localStorage.getItem(WORKSPACE_KEY);
      if (saved) return JSON.parse(saved) as WorkspaceState;
    } catch {
      // A corrupted local draft falls back to the bundled demo data.
    }
    return createInitialState();
  }

  private loadSession(): ReconcileSession | null {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) return JSON.parse(saved) as ReconcileSession;
    } catch {
      // Corrupted session: start fresh.
    }
    return null;
  }

  private emit() {
    this.dispatchEvent(new CustomEvent('change'));
  }
}

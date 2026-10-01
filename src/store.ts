import { createInitialState } from './data';
import {
  buildPendingRelease,
  contractFingerprint,
  createReconciliation,
  hashState,
  refreshReconciliation,
  resolveAllConflicts as reconcileAll,
  resolveComponentAction as reconcileComponentAction,
  resolveComponentField as reconcileComponentField,
  resolveComponentMatch as reconcileComponentMatch,
  resolvePropertyAction as reconcilePropertyAction,
  resolvePropertyField as reconcilePropertyField,
  resolvePropertyMatch as reconcilePropertyMatch
} from './reconcile';
import type {
  ComponentActionDecision,
  ComponentMatchDecision,
  FieldDecision,
  PendingRelease,
  PropertyActionDecision,
  PropertyMatchDecision,
  ReconcileSide,
  ReconciliationSession,
  RemotePackage
} from './reconcile';
import type { ComponentSnapshot, ComponentSpec, SyncBaseline, ValidationIssue, WorkspaceState } from './types';
import { sampleRemotePackage } from './remote-package';

const STORAGE_KEY = 'sologsb-1028-workspace-v2';
const LEGACY_STORAGE_KEY = 'sologsb-1028-workspace-v1';

export class StorageQuotaError extends Error {
  constructor(message = '本地存储容量不足，本批写入已拒绝，原工作区保持不变。') {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

const clone = <T>(value: T): T => structuredClone(value);
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const contractSignature = (component: ComponentSpec) => contractFingerprint(component);

export class SpecStore extends EventTarget {
  state: WorkspaceState;
  private undoStack: WorkspaceState[] = [];
  private redoStack: WorkspaceState[] = [];
  private lastAction = '';
  lastError = '';

  constructor() {
    super();
    this.state = this.load();
  }

  get selected(): ComponentSpec | undefined {
    return this.state.components.find((item) => item.id === this.state.selectedId);
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  get lastUndoLabel() { return this.lastAction; }
  get openSessions() { return this.state.reconciliationSessions.filter((item) => item.status === 'open' || item.status === 'release-ready'); }
  get recentSessions() { return this.state.reconciliationSessions.filter((item) => item.status !== 'discarded').slice(0, 8); }

  select(id: string) {
    if (!this.state.components.some((item) => item.id === id)) return;
    this.commitState('切换组件', { ...this.state, selectedId: id }, false);
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
      a11yGuidance: '',
      a11yStale: false,
      a11yStaleReason: '',
      examples: [],
      revision: 1,
      updatedAt: new Date().toISOString(),
      snapshots: []
    };
    this.commit('新建组件', (state) => {
      state.components.unshift(component);
      state.selectedId = id;
      state.syncBaselines.push({
        componentId: id,
        updatedAt: component.updatedAt,
        storedAt: new Date().toISOString(),
        fields: this.componentFields(component),
        properties: clone(component.properties)
      });
    });
  }

  updateComponent(patch: Partial<ComponentSpec>, markContractStale = false) {
    const selected = this.selected;
    if (!selected) return;
    this.commit('编辑组件', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      if (!target) return;
      const before = contractSignature(target);
      Object.assign(target, patch, { updatedAt: new Date().toISOString() });
      const after = contractSignature(target);
      if (markContractStale || before !== after) this.invalidateComponentContract(target, '组件交互或属性契约已修改，示例需要重新验证。');
      else if (patch.screenReader !== undefined || patch.keyboardBehavior !== undefined) {
        target.a11yStale = true;
        target.a11yStaleReason = '人工键盘或读屏说明已修改，建议重新计算自动无障碍说明。';
      }
    });
  }

  addProperty() {
    const selected = this.selected;
    if (!selected) return;
    this.commit('新增属性', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      if (!target) return;
      target.properties.push({
        id: uid('property'),
        name: 'newProperty',
        type: 'string',
        required: false,
        defaultValue: '',
        description: '描述该属性对开发者和用户的影响。'
      });
      target.updatedAt = new Date().toISOString();
      this.invalidateComponentContract(target, '新增属性后，依赖示例和无障碍说明需要重新验证。');
    });
  }

  updateProperty(propertyId: string, patch: Partial<ComponentSpec['properties'][number]>) {
    const selected = this.selected;
    if (!selected) return;
    this.commit('编辑属性', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      const property = target?.properties.find((item) => item.id === propertyId);
      if (target && property) {
        const contractFieldsChanged = ['name', 'type', 'required', 'defaultValue'].some((field) => field in patch);
        Object.assign(property, patch);
        target.updatedAt = new Date().toISOString();
        if (contractFieldsChanged) {
          this.invalidateComponentContract(target, `属性 ${property.name} 的契约已修改，依赖示例和无障碍说明需要重算。`);
        }
      }
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
      target.updatedAt = new Date().toISOString();
      target.examples.forEach((example) => {
        if (example.propertyIds.includes(propertyId) || example.code.includes(property.name)) {
          example.stale = true;
          example.staleReason = `属性 ${property.name} 已删除，示例代码或说明仍可能引用它。`;
        }
      });
      this.invalidateComponentContract(target, `属性 ${property.name} 已删除，无障碍依赖需要重算。`);
    });
  }

  addExample() {
    const selected = this.selected;
    if (!selected) return;
    this.commit('新增示例', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      if (!target) return;
      target.examples.push({
        id: uid('example'),
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
      const snapshot: ComponentSnapshot = {
        revision: target.revision,
        savedAt: new Date().toISOString(),
        reason,
        component: { ...component, revision: target.revision }
      };
      target.snapshots.unshift(snapshot);
      target.revision += 1;
      target.updatedAt = new Date().toISOString();
    });
  }

  migrateExamples() {
    const selected = this.selected;
    if (!selected) return;
    this.commit('迁移示例到当前版本', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      if (!target) return;
      const activePropertyIds = new Set(target.properties.map((item) => item.id));
      target.examples.forEach((example) => {
        example.propertyIds = example.propertyIds.filter((id) => activePropertyIds.has(id));
        example.stale = false;
        example.staleReason = '';
        example.createdFromRevision = target.revision;
      });
      this.recomputeA11y(target, true);
      target.a11yStale = false;
      target.a11yStaleReason = '';
    });
  }

  recomputeSelectedA11y() {
    const selected = this.selected;
    if (!selected) return;
    this.commit('重算无障碍说明', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      if (target) this.recomputeA11y(target, target.a11yStale === true);
    });
  }

  acknowledgeA11y() {
    const selected = this.selected;
    if (!selected) return;
    this.commit('采用无障碍说明', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      if (!target || target.a11yStale) return;
      target.screenReader = target.a11yGuidance?.split('\n').join('；') ?? target.screenReader;
    });
  }

  startReconciliation(remotePackage: RemotePackage) {
    this.sessionCommit('开始跨仓对账', (state) => {
      const session = createReconciliation(remotePackage, state.components, state.syncBaselines);
      state.reconciliationSessions.unshift(session);
      return session.id;
    });
  }

  useSamplePackage() {
    this.startReconciliation(sampleRemotePackage);
  }

  refreshSession(sessionId: string) {
    this.sessionCommit('刷新对账候选', (state) => {
      const index = state.reconciliationSessions.findIndex((item) => item.id === sessionId);
      if (index < 0) return;
      const session = refreshReconciliation(state.reconciliationSessions[index], state.components, state.syncBaselines);
      if (state.pendingReleases.some((release) => release.sessionId === session.id)) session.status = 'release-ready';
      state.reconciliationSessions[index] = session;
    });
  }

  resolveComponentMatch(sessionId: string, remoteKey: string, decision: ComponentMatchDecision, componentId = '') {
    this.sessionCommit('裁定组件配对', (state) => this.updateSession(state, sessionId, (session) => {
      const updated = reconcileComponentMatch(session, remoteKey, decision, componentId, state.components, state.syncBaselines);
      const item = updated.components.find((component) => component.remoteKey === remoteKey);
      if (item && !componentId) item.selectedLocalId = decision === 'new' ? undefined : item.selectedLocalId;
      return updated;
    }));
  }

  resolveComponentAction(sessionId: string, remoteKey: string, action: ComponentActionDecision) {
    this.sessionCommit('裁定组件动作', (state) => this.updateSession(state, sessionId, (session) => reconcileComponentAction(session, remoteKey, action)));
  }

  resolveComponentField(sessionId: string, remoteKey: string, field: string, decision: FieldDecision) {
    this.sessionCommit('裁定组件字段', (state) => this.updateSession(state, sessionId, (session) => reconcileComponentField(session, remoteKey, field, decision)));
  }

  resolvePropertyMatch(sessionId: string, componentKey: string, propertyKey: string, decision: PropertyMatchDecision, propertyId = '') {
    this.sessionCommit('裁定属性配对', (state) => this.updateSession(state, sessionId, (session) => {
      const candidate = session.components.find((item) => item.remoteKey === componentKey);
      const component = state.components.find((item) => item.id === candidate?.selectedLocalId);
      const baseline = state.syncBaselines.find((item) => item.componentId === component?.id);
      return reconcilePropertyMatch(session, componentKey, propertyKey, decision, propertyId, component, baseline?.properties ?? []);
    }));
  }

  resolvePropertyAction(sessionId: string, componentKey: string, propertyKey: string, action: PropertyActionDecision) {
    this.sessionCommit('裁定属性动作', (state) => this.updateSession(state, sessionId, (session) => reconcilePropertyAction(session, componentKey, propertyKey, action)));
  }

  resolvePropertyField(sessionId: string, componentKey: string, propertyKey: string, field: string, decision: FieldDecision) {
    this.sessionCommit('裁定属性字段', (state) => this.updateSession(state, sessionId, (session) => reconcilePropertyField(session, componentKey, propertyKey, field, decision)));
  }

  resolveAllConflicts(sessionId: string, side: ReconcileSide) {
    this.sessionCommit(`整批采用${side === 'remote' ? '规范仓' : '本地草稿'}`, (state) => this.updateSession(state, sessionId, (session) => reconcileAll(session, side)));
  }

  generateRelease(sessionId: string) {
    this.sessionCommit('生成待发布版本', (state) => {
      const session = state.reconciliationSessions.find((item) => item.id === sessionId);
      if (!session) return;
      const result = buildPendingRelease(session, state.components, state.archivedComponents);
      if (!result.release || result.error) throw new Error(result.error ?? '待发布版本无法生成。');
      state.pendingReleases = state.pendingReleases.filter((release) => release.sessionId !== sessionId);
      state.pendingReleases.unshift(result.release);
      session.pendingReleaseId = result.release.id;
      session.status = 'release-ready';
      session.updatedAt = new Date().toISOString();
    });
  }

  discardSession(sessionId: string) {
    this.sessionCommit('放弃对账', (state) => {
      const session = state.reconciliationSessions.find((item) => item.id === sessionId);
      if (session) session.status = 'discarded';
      state.pendingReleases = state.pendingReleases.filter((release) => release.sessionId !== sessionId);
    });
  }

  publishRelease(releaseId: string) {
    try {
      this.commit('发布待发布版本', (state) => {
      const releaseIndex = state.pendingReleases.findIndex((item) => item.id === releaseId);
      const release = state.pendingReleases[releaseIndex];
      if (!release) throw new Error('待发布版本不存在。');
      const currentHash = hashState({ components: state.components, archivedComponents: state.archivedComponents });
      if (release.baseHash !== currentHash) throw new Error('生成待发布版本后工作区又发生变化，请刷新对账并重新生成。');

      for (const entry of release.components) {
        if (entry.action === 'skip') continue;
        const incoming = entry.component;
        const current = state.components.find((component) => component.id === incoming.id);
        if (current) {
          const snapshot = this.snapshotFrom(current, '跨仓发布前保留旧快照');
          if (entry.action === 'remove' || entry.action === 'deprecate') {
            const archived = clone(current);
            archived.status = entry.action === 'deprecate' ? 'deprecated' : current.status;
            archived.snapshots = [snapshot, ...current.snapshots.filter((item) => item.revision !== snapshot.revision)];
            state.archivedComponents.unshift(archived);
            state.components = state.components.filter((component) => component.id !== incoming.id);
          } else {
            incoming.snapshots = [snapshot, ...current.snapshots.filter((item) => item.revision !== snapshot.revision)];
            const index = state.components.findIndex((component) => component.id === incoming.id);
            state.components[index] = incoming;
          }
        } else if (entry.action === 'remove' || entry.action === 'deprecate') {
          state.archivedComponents.unshift(clone(incoming));
        } else {
          state.components.unshift(incoming);
        }
        this.upsertBaseline(state, incoming);
      }

      const session = state.reconciliationSessions.find((item) => item.id === release.sessionId);
      if (session) session.status = 'published';
      state.pendingReleases.splice(releaseIndex, 1);
      state.lastSyncAt = new Date().toISOString();
      if (!state.components.some((component) => component.id === state.selectedId)) {
        state.selectedId = state.components[0]?.id ?? state.archivedComponents[0]?.id ?? '';
      }
      });
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
    }
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
      if (component.a11yStale) {
        issues.push({ id: `${component.id}-a11y-stale`, level: 'warning', componentId: component.id, target: component.name, message: component.a11yStaleReason || '无障碍说明已因契约变化失效。', field: 'screenReader' });
      }
      if (contractChanged && component.examples.length) {
        issues.push({ id: `${component.id}-contract`, level: 'info', componentId: component.id, target: component.name, message: '属性契约或交互签名发生变化，建议创建快照并迁移示例。', field: 'properties' });
      }
    }
    return issues;
  }

  undo() {
    const previous = this.undoStack.pop();
    if (!previous) return;
    const current = clone(this.state);
    this.transactionState(previous, () => {
      this.redoStack.push(current);
    });
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    const current = clone(this.state);
    this.transactionState(next, () => {
      this.undoStack.push(current);
    });
  }

  reset() {
    this.undoStack = [];
    this.redoStack = [];
    this.state = createInitialState();
    this.persistState();
    this.emit();
  }

  private commit(label: string, mutator: (state: WorkspaceState) => void) {
    const next = clone(this.state);
    try {
      mutator(next);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
      return;
    }
    this.transactionState(next, () => {
      this.undoStack.push(clone(this.state));
      this.undoStack = this.undoStack.slice(-40);
      this.redoStack = [];
      this.lastAction = label;
    });
  }

  private commitState(label: string, next: WorkspaceState, addHistory = true) {
    this.transactionState(next, () => {
      if (addHistory) this.undoStack.push(clone(this.state));
      this.redoStack = [];
      this.lastAction = label;
    });
  }

  private sessionCommit(label: string, mutator: (state: WorkspaceState) => void) {
    const next = clone(this.state);
    try {
      mutator(next);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
      return;
    }
    this.transactionState(next, () => {
      this.lastAction = label;
    });
  }

  private transactionState(next: WorkspaceState, beforePersist: () => void) {
    const previous = this.state;
    const previousUndo = clone(this.undoStack);
    const previousRedo = clone(this.redoStack);
    const previousAction = this.lastAction;
    this.state = next;
    beforePersist();
    try {
      this.persistState();
    } catch (error) {
      this.state = previous;
      this.undoStack = previousUndo;
      this.redoStack = previousRedo;
      this.lastAction = previousAction;
      this.fail(error instanceof Error ? error.message : String(error));
      return;
    }
    this.emit();
  }

  private invalidatePendingReleaseForSession(state: WorkspaceState, sessionId: string) {
    state.pendingReleases = state.pendingReleases.filter((release) => release.sessionId !== sessionId);
  }

  private updateSession(state: WorkspaceState, sessionId: string, updater: (session: ReconciliationSession) => ReconciliationSession) {
    const index = state.reconciliationSessions.findIndex((item) => item.id === sessionId);
    const session = state.reconciliationSessions[index];
    if (!session) return;
    if (session.status === 'release-ready') {
      this.invalidatePendingReleaseForSession(state, sessionId);
      session.pendingReleaseId = undefined;
    }
    state.reconciliationSessions[index] = updater(session);
  }

  private componentFields(component: ComponentSpec): Record<string, string | boolean> {
    return {
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
    };
  }

  private upsertBaseline(state: WorkspaceState, component: ComponentSpec) {
    const baseline: SyncBaseline = {
      componentId: component.id,
      updatedAt: component.updatedAt,
      storedAt: new Date().toISOString(),
      fields: this.componentFields(component),
      properties: clone(component.properties)
    };
    const index = state.syncBaselines.findIndex((item) => item.componentId === component.id);
    if (index >= 0) state.syncBaselines[index] = baseline;
    else state.syncBaselines.push(baseline);
  }

  private snapshotFrom(component: ComponentSpec, reason: string): ComponentSnapshot {
    const { snapshots: _ignored, ...content } = clone(component);
    return {
      revision: component.revision,
      savedAt: new Date().toISOString(),
      reason,
      component: content
    };
  }

  private invalidateComponentContract(target: ComponentSpec, reason: string) {
    target.examples.forEach((example) => {
      example.stale = true;
      example.staleReason = reason;
    });
    this.recomputeA11y(target, true);
    target.a11yStaleReason = reason;
  }

  private recomputeA11y(component: ComponentSpec, stale: boolean) {
    const required = component.properties.filter((item) => item.required).map((item) => item.name);
    const booleanStates = component.properties.filter((item) => item.type === 'boolean').map((item) => item.name);
    component.a11yGuidance = [
      `键盘：${component.keyboardBehavior || '待补充键盘行为。'}`,
      `读屏必须暴露组件名称；必填属性：${required.join('、') || '无'}。`,
      booleanStates.length ? `需要播报布尔状态：${booleanStates.join('、')}。` : '无额外布尔状态。',
      `交互契约：${component.interactionSignature || '待补充。'}`
    ].join('\n');
    component.a11yStale = stale;
    if (!stale) component.a11yStaleReason = '';
  }

  private load(): WorkspaceState {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
      if (saved) return normalizeState(JSON.parse(saved) as WorkspaceState);
    } catch {
      // A corrupted local draft falls back to the bundled demo data.
    }
    return normalizeState(createInitialState());
  }

  private persistState() {
    const serialized = JSON.stringify(this.state);
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      this.lastError = '';
    } catch (error) {
      const quota = error instanceof DOMException && (error.name === 'QuotaExceededError' || error.code === 22);
      const message = quota ? new StorageQuotaError().message : '本地存储写入失败，本批写入未生效。';
      this.lastError = message;
      if (quota) throw new StorageQuotaError(message);
      throw error;
    }
  }

  private fail(message: string) {
    this.lastError = message;
    this.dispatchEvent(new CustomEvent('error', { detail: message }));
    this.dispatchEvent(new CustomEvent('change'));
  }

  private emit() {
    this.dispatchEvent(new CustomEvent('change'));
  }
}

function normalizeState(raw: Partial<WorkspaceState>): WorkspaceState {
  const initial = createInitialState();
  const normalizeComponent = (component: Partial<ComponentSpec>): ComponentSpec => ({
    ...initial.components[0],
    ...component,
    properties: Array.isArray(component.properties) ? component.properties : [],
    examples: Array.isArray(component.examples) ? component.examples : [],
    snapshots: Array.isArray(component.snapshots) ? component.snapshots : [],
    a11yGuidance: component.a11yGuidance ?? '',
    a11yStale: component.a11yStale ?? false,
    a11yStaleReason: component.a11yStaleReason ?? '',
    revision: component.revision ?? 1,
    updatedAt: component.updatedAt ?? new Date().toISOString()
  });
  const components = Array.isArray(raw.components) ? raw.components.map(normalizeComponent) : initial.components;
  return {
    components,
    archivedComponents: Array.isArray(raw.archivedComponents) ? raw.archivedComponents.map(normalizeComponent) : [],
    selectedId: raw.selectedId && components.some((component) => component.id === raw.selectedId) ? raw.selectedId : components[0]?.id ?? '',
    syncBaselines: Array.isArray(raw.syncBaselines)
      ? raw.syncBaselines.map((baseline) => ({ ...baseline, storedAt: baseline.storedAt ?? raw.lastSyncAt ?? new Date().toISOString() }))
      : [],
    pendingReleases: Array.isArray(raw.pendingReleases) ? raw.pendingReleases as PendingRelease[] : [],
    lastSyncAt: raw.lastSyncAt ?? initial.lastSyncAt,
    reconciliationSessions: Array.isArray(raw.reconciliationSessions) ? raw.reconciliationSessions as ReconciliationSession[] : []
  };
}

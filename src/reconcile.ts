import type { ComponentSpec, PropertySpec } from './types';

export type ReconcileSide = 'local' | 'remote';
export type ComponentMatchDecision = 'new' | 'skip' | 'id' | 'match' | 'unmatched' | '';
export type PropertyMatchDecision = 'create' | 'skip' | 'id' | 'match' | 'unmatched' | '';
export type ComponentActionDecision = 'update' | 'deprecate' | 'remove' | 'skip' | '';
export type PropertyActionDecision = 'update' | 'create' | 'remove' | 'skip' | '';
export type ReconcileStatus = 'ready' | 'conflict' | 'ambiguous' | 'unchanged';
export type FieldDecision = ReconcileSide | '';

export interface RemotePropertyPackage {
  id?: string;
  name: string;
  type: string;
  required?: boolean;
  defaultValue?: string;
  description?: string;
  removed?: boolean;
}

export interface RemoteComponentPackage {
  id?: string;
  name: string;
  category?: string;
  status?: ComponentSpec['status'];
  purpose?: string;
  usage?: string;
  states?: string;
  keyboardBehavior?: string;
  screenReader?: string;
  disabledScenarios?: string;
  interactionSignature?: string;
  removed?: boolean;
  properties: RemotePropertyPackage[];
}

export interface RemotePackage {
  id: string;
  name: string;
  version: string;
  exportedAt: string;
  components: RemoteComponentPackage[];
}

export interface ReconcileField {
  field: string;
  label: string;
  localValue?: string | boolean;
  remoteValue?: string | boolean;
  baselineValue?: string | boolean;
  state: ReconcileStatus;
  decision: FieldDecision;
}

export interface PropertyReconcile {
  remoteKey: string;
  remote: RemotePropertyPackage;
  localCandidates: Array<PropertySpec & { componentId: string }>;
  selectedLocalId?: string;
  matchDecision: PropertyMatchDecision;
  action: PropertyActionDecision;
  fields: ReconcileField[];
  state: ReconcileStatus;
  blockingReason: string;
}

export interface ComponentReconcile {
  remoteKey: string;
  remote: RemoteComponentPackage;
  localCandidates: ComponentSpec[];
  selectedLocalId?: string;
  matchDecision: ComponentMatchDecision;
  action: ComponentActionDecision;
  fields: ReconcileField[];
  properties: PropertyReconcile[];
  state: ReconcileStatus;
  blockingReason: string;
}

export interface ReconciliationSession {
  id: string;
  packageId: string;
  packageName: string;
  packageVersion: string;
  exportedAt: string;
  startedAt: string;
  updatedAt: string;
  status: 'open' | 'release-ready' | 'published' | 'discarded';
  remotePackage: RemotePackage;
  components: ComponentReconcile[];
  pendingReleaseId?: string;
}

export interface PendingReleaseComponent {
  remoteKey: string;
  componentId: string;
  action: Exclude<ComponentActionDecision, ''>;
  component: ComponentSpec;
}

export interface PendingRelease {
  id: string;
  packageId: string;
  packageName: string;
  packageVersion: string;
  sessionId: string;
  createdAt: string;
  baseHash: string;
  components: PendingReleaseComponent[];
}

interface PropertyBaselineLike {
  id: string;
  name: string;
  type: string;
  required: boolean;
  defaultValue: string;
  description: string;
}

interface ComponentBaselineLike {
  updatedAt: string;
  storedAt?: string;
  fields: Record<string, string | boolean>;
  properties: PropertyBaselineLike[];
}

const componentFieldLabels: Record<string, string> = {
  name: '组件名称',
  category: '分类',
  status: '状态',
  purpose: '用途',
  usage: '使用规则',
  states: '状态',
  keyboardBehavior: '键盘行为',
  screenReader: '读屏说明',
  disabledScenarios: '禁用场景',
  interactionSignature: '交互签名'
};

const propertyFieldLabels: Record<string, string> = {
  name: '属性名称',
  type: '类型',
  required: '必填',
  defaultValue: '默认值',
  description: '说明'
};

const componentFields = Object.keys(componentFieldLabels);
const contractFields = ['name', 'type', 'required', 'defaultValue'];
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const clean = (value: unknown): string => String(value ?? '').trim();
const normalized = (value: string | boolean | undefined): string | boolean | undefined =>
  typeof value === 'boolean' ? value : value === undefined ? undefined : clean(value);

function valuesEqual(left: string | boolean | undefined, right: string | boolean | undefined): boolean {
  return normalized(left) === normalized(right);
}

function fieldState(localChanged: boolean, remoteChanged: boolean): ReconcileStatus {
  if (localChanged && remoteChanged) return 'conflict';
  if (localChanged || remoteChanged) return 'ready';
  return 'unchanged';
}

function makeField(
  field: string,
  label: string,
  local: string | boolean | undefined,
  remote: string | boolean | undefined,
  baseline: string | boolean | undefined
): ReconcileField {
  const localChanged = baseline !== undefined && !valuesEqual(local, baseline);
  const remoteChanged = baseline !== undefined && !valuesEqual(remote, baseline);
  return {
    field,
    label,
    localValue: local,
    remoteValue: remote,
    baselineValue: baseline,
    state: fieldState(localChanged, remoteChanged),
    decision: ''
  };
}

function remoteComponentValues(remote: RemoteComponentPackage): Record<string, string | boolean> {
  return {
    name: remote.name,
    category: remote.category ?? 'General',
    status: remote.status ?? 'published',
    purpose: remote.purpose ?? '',
    usage: remote.usage ?? '',
    states: remote.states ?? '',
    keyboardBehavior: remote.keyboardBehavior ?? '',
    screenReader: remote.screenReader ?? '',
    disabledScenarios: remote.disabledScenarios ?? '',
    interactionSignature: remote.interactionSignature ?? ''
  };
}

function localComponentValues(component: ComponentSpec): Record<string, string | boolean> {
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

function remotePropertyValues(remote: RemotePropertyPackage): Record<string, string | boolean> {
  return {
    name: remote.name,
    type: remote.type,
    required: remote.required ?? false,
    defaultValue: remote.defaultValue ?? '',
    description: remote.description ?? ''
  };
}

function localPropertyValues(property: PropertySpec): Record<string, string | boolean> {
  return {
    name: property.name,
    type: property.type,
    required: property.required,
    defaultValue: property.defaultValue,
    description: property.description
  };
}

function componentMatches(component: ComponentSpec, remote: RemoteComponentPackage): boolean {
  return clean(component.name).toLowerCase() === clean(remote.name).toLowerCase()
    && clean(component.category).toLowerCase() === clean(remote.category ?? component.category).toLowerCase();
}

function propertyMatches(property: PropertySpec, remote: RemotePropertyPackage): boolean {
  return clean(property.name).toLowerCase() === clean(remote.name).toLowerCase()
    && clean(property.type).toLowerCase() === clean(remote.type).toLowerCase();
}

function localComponentModified(component: ComponentSpec, baseline?: ComponentBaselineLike): boolean {
  if (!baseline) return false;
  if (baseline.storedAt && component.updatedAt > baseline.storedAt) return true;
  if (!baseline.storedAt && component.updatedAt !== baseline.updatedAt) return true;
  const localValues = localComponentValues(component);
  if (Object.keys(baseline.fields).some((field) => !valuesEqual(localValues[field], baseline.fields[field]))) return true;
  return propertyFingerprint(component.properties) !== propertyFingerprint(baseline.properties);
}

function localPropertyModified(property: PropertySpec | undefined, baseline?: PropertyBaselineLike): boolean {
  if (!property || !baseline) return false;
  return localPropertyValues(property) && Object.keys(localPropertyValues(property)).some((field) => {
    const current = localPropertyValues(property)[field];
    const base = (baseline as unknown as Record<string, string | boolean>)[field];
    return !valuesEqual(current, base);
  });
}

function propertyFingerprint(properties: Array<Pick<PropertySpec, 'name' | 'type' | 'required' | 'defaultValue'>>): string {
  return properties
    .map((item) => `${item.name}:${item.type}:${item.required}:${item.defaultValue}`)
    .sort()
    .join('|');
}

export function contractFingerprint(component: Pick<ComponentSpec, 'properties' | 'interactionSignature'>): string {
  return `${propertyFingerprint(component.properties)}::${component.interactionSignature}`;
}

function makeComponentFields(
  remote: RemoteComponentPackage,
  local: ComponentSpec | undefined,
  baseline: ComponentBaselineLike | undefined
): ReconcileField[] {
  const remoteValues = remoteComponentValues(remote);
  const localValues = local ? localComponentValues(local) : {};
  return componentFields.map((field) => makeField(
    field,
    componentFieldLabels[field],
    local ? localValues[field] : undefined,
    remoteValues[field],
    baseline?.fields[field]
  ));
}

function makePropertyFields(
  remote: RemotePropertyPackage,
  local: PropertySpec | undefined,
  baseline: PropertyBaselineLike | undefined
): ReconcileField[] {
  const remoteValues = remotePropertyValues(remote);
  const localValues = local ? localPropertyValues(local) : {};
  return Object.keys(propertyFieldLabels).map((field) => makeField(
    field,
    propertyFieldLabels[field],
    local ? localValues[field] : undefined,
    remoteValues[field],
    baseline ? (baseline as unknown as Record<string, string | boolean>)[field] : undefined
  ));
}

function reconcileProperty(
  remote: RemotePropertyPackage,
  remoteKey: string,
  localProperties: Array<PropertySpec & { componentId: string }>,
  baselineProperties: PropertyBaselineLike[]
): PropertyReconcile {
  const exact = remote.id ? localProperties.filter((item) => item.id === remote.id) : [];
  const nameTypeMatches = remote.id ? [] : localProperties.filter((item) => propertyMatches(item, remote));
  const candidates = (exact.length ? exact : nameTypeMatches);
  const selected = exact[0] ?? candidates[0];
  const baseline = remote.id
    ? baselineProperties.find((item) => item.id === remote.id)
    : baselineProperties.find((item) => propertyMatches(item, remote));
  const ambiguous = candidates.length > 1;
  const fields = makePropertyFields(remote, selected, baseline);
  const localChanged = localPropertyModified(selected, baseline);
  const remoteChanged = !baseline || Object.values(remotePropertyValues(remote)).some((value, index) => {
    const field = Object.keys(remotePropertyValues(remote))[index];
    return !valuesEqual(value, (baseline as unknown as Record<string, string | boolean> | undefined)?.[field]);
  });
  let state: ReconcileStatus = 'ready';
  let action: PropertyActionDecision = '';
  let matchDecision: PropertyMatchDecision = '';
  let blockingReason = '';

  if (ambiguous) {
    state = 'ambiguous';
    blockingReason = `属性 ${remote.name} 需要从 ${candidates.length} 个名称/类型候选中指定。`;
  } else if (remote.removed) {
    action = selected ? '' : 'skip';
    if (localChanged) {
      state = 'conflict';
      blockingReason = `规范仓下架属性 ${remote.name}，本地草稿刚修改过它。`;
    } else {
      action = 'remove';
    }
  } else if (baseline) {
    action = selected ? 'update' : 'create';
    if (localChanged && remoteChanged) {
      state = 'conflict';
      blockingReason = `属性 ${remote.name} 两边都有新值。`;
    }
  } else {
    action = exact[0] ? 'update' : 'create';
  }

  if (state === 'conflict' && !fields.some((field) => field.state === 'conflict')) {
    fields.forEach((field) => {
      if (field.state !== 'unchanged') field.state = 'conflict';
    });
  }

  return {
    remoteKey,
    remote,
    localCandidates: ambiguous ? candidates : candidates,
    selectedLocalId: ambiguous ? undefined : selected?.id,
    matchDecision,
    action,
    fields,
    state,
    blockingReason
  };
}

function reconcileComponent(
  remote: RemoteComponentPackage,
  index: number,
  locals: ComponentSpec[],
  baselines: SyncBaselineLike[]
): ComponentReconcile {
  const remoteKey = remote.id ?? `${remote.name}@${remote.category ?? 'General'}:${index}`;
  const exact = remote.id ? locals.filter((item) => item.id === remote.id) : [];
  const nameType = remote.id ? [] : locals.filter((item) => componentMatches(item, remote));
  const candidates = exact.length ? exact : nameType;
  const selected = exact[0] ?? candidates[0];
  const baseline = selected ? baselines.find((item) => item.componentId === selected.id) : undefined;
  const ambiguous = candidates.length > 1;
  const fields = makeComponentFields(remote, selected, baseline);
  const candidateProperties = candidates.flatMap((candidate) => candidate.properties.map((property) => ({ ...property, componentId: candidate.id })));
  const localProperties = selected?.properties.map((item) => ({ ...item, componentId: selected.id })) ?? candidateProperties;
  const properties = remote.properties.map((property, propertyIndex) => reconcileProperty(
    property,
    property.id ?? `${property.name}:${property.type}:${propertyIndex}`,
    localProperties,
    baseline?.properties ?? []
  ));
  const localChanged = selected ? localComponentModified(selected, baseline) : false;
  let state: ReconcileStatus = 'ready';
  let action: ComponentActionDecision = '';
  let matchDecision: ComponentMatchDecision = '';
  let blockingReason = '';

  if (ambiguous) {
    state = 'ambiguous';
    blockingReason = `规范包 ${remote.name} 命中 ${candidates.length} 个本地组件，请指定配对。`;
  } else if (remote.removed) {
    action = selected ? '' : 'skip';
    if (localChanged) {
      state = 'conflict';
      blockingReason = `规范仓下架 ${remote.name}，但本地草稿有未发布修改。`;
    } else {
      action = 'remove';
    }
  } else if (baseline) {
    action = selected ? 'update' : 'update';
    const remoteChanged = remoteChangedFromBaseline(remote, baseline);
    if (selected && localChanged && remoteChanged) {
      state = 'conflict';
      blockingReason = `组件 ${remote.name} 两边都有新值。`;
    }
  } else {
    action = exact[0] ? 'update' : 'update';
  }

  if (state !== 'ambiguous' && properties.some((item) => item.state === 'conflict' || item.state === 'ambiguous')) state = properties.some((item) => item.state === 'ambiguous') ? 'ambiguous' : 'conflict';
  if (state !== 'ambiguous' && fields.some((item) => item.state === 'conflict')) state = 'conflict';
  if ((state === 'conflict' || state === 'ambiguous') && !blockingReason) {
    blockingReason = state === 'ambiguous' ? '仍有属性候选未配对。' : '仍有字段或属性冲突需要裁定。';
  }

  return {
    remoteKey,
    remote,
    localCandidates: candidates,
    selectedLocalId: ambiguous ? undefined : selected?.id,
    matchDecision,
    action,
    fields,
    properties,
    state,
    blockingReason
  };
}

type SyncBaselineLike = {
  componentId: string;
  updatedAt: string;
  fields: Record<string, string | boolean>;
  properties: PropertyBaselineLike[];
};

function remoteChangedFromBaseline(remote: RemoteComponentPackage, baseline: ComponentBaselineLike): boolean {
  const values = remoteComponentValues(remote);
  return Object.keys(baseline.fields).some((field) => !valuesEqual(values[field], baseline.fields[field]))
    || propertyFingerprint(remote.properties.map((item) => ({
      name: item.name,
      type: item.type,
      required: item.required ?? false,
      defaultValue: item.defaultValue ?? ''
    }))) !== propertyFingerprint(baseline.properties);
}

function defaultComponentMatch(item: ComponentReconcile): ComponentMatchDecision {
  if (item.state === 'ambiguous') return '';
  if (item.action === 'skip') return 'skip';
  if (!item.selectedLocalId) return 'new';
  return item.remote.id ? 'id' : 'match';
}

function defaultPropertyMatch(item: PropertyReconcile): PropertyMatchDecision {
  if (item.state === 'ambiguous') return '';
  if (item.action === 'skip') return 'skip';
  if (!item.selectedLocalId) return 'create';
  return item.remote.id ? 'id' : 'match';
}

export function createReconciliation(remotePackage: RemotePackage, locals: ComponentSpec[], baselines: SyncBaselineLike[]): ReconciliationSession {
  const now = new Date().toISOString();
  const components = remotePackage.components.map((component, index) => {
    const item = reconcileComponent(component, index, locals, baselines);
    item.matchDecision = defaultComponentMatch(item);
    item.properties.forEach((property) => {
      property.matchDecision = defaultPropertyMatch(property);
    });
    return revalidateComponent(item);
  });
  return {
    id: uid('reconciliation'),
    packageId: remotePackage.id,
    packageName: remotePackage.name,
    packageVersion: remotePackage.version,
    exportedAt: remotePackage.exportedAt,
    startedAt: now,
    updatedAt: now,
    status: 'open',
    remotePackage,
    components
  };
}

export function refreshReconciliation(session: ReconciliationSession, locals: ComponentSpec[], baselines: SyncBaselineLike[]): ReconciliationSession {
  const restored = createReconciliation(session.remotePackage, locals, baselines);
  restored.id = session.id;
  restored.startedAt = session.startedAt;
  restored.status = session.status === 'release-ready' ? 'open' : session.status;
  restored.pendingReleaseId = session.pendingReleaseId;
  restored.components = restored.components.map((item, index) => {
    const previous = session.components[index];
    if (!previous) return item;
    item.matchDecision = previous.matchDecision || defaultComponentMatch(item);
    item.action = previous.action;
    item.fields.forEach((field) => {
      const old = previous.fields.find((candidate) => candidate.field === field.field);
      field.decision = old?.decision ?? '';
    });
    item.properties.forEach((property) => {
      const oldProperty = previous.properties.find((candidate) => candidate.remoteKey === property.remoteKey);
      property.matchDecision = oldProperty?.matchDecision || defaultPropertyMatch(property);
      property.action = oldProperty?.action ?? '';
      property.fields.forEach((field) => {
        const oldField = oldProperty?.fields.find((candidate) => candidate.field === field.field);
        field.decision = oldField?.decision ?? '';
      });
    });
    return revalidateComponent(item);
  });
  return restored;
}

export function resolveComponentMatch(
  session: ReconciliationSession,
  remoteKey: string,
  decision: ComponentMatchDecision,
  componentId = '',
  locals: ComponentSpec[] = [],
  baselines: SyncBaselineLike[] = []
): ReconciliationSession {
  const next = structuredClone(session);
  const item = next.components.find((candidate) => candidate.remoteKey === remoteKey);
  if (!item) return next;
  const previous = structuredClone(item);
  item.matchDecision = decision;
  if (decision === 'id' || decision === 'match') item.selectedLocalId = componentId;
  if (decision === 'new' || decision === 'skip' || decision === 'unmatched') item.selectedLocalId = undefined;

  const selected = locals.find((component) => component.id === item.selectedLocalId);
  if (decision === 'id' && item.remote.id && selected?.id !== item.remote.id) return next;
  if (decision === 'match' && selected && !componentMatches(selected, item.remote)) return next;
  const baseline = selected ? baselines.find((entry) => entry.componentId === selected.id) : undefined;
  if ((decision === 'id' || decision === 'match') && selected) {
    item.fields = makeComponentFields(item.remote, selected, baseline).map((field) => {
      const old = previous.fields.find((candidate) => candidate.field === field.field);
      field.decision = old?.decision ?? '';
      return field;
    });
    const localProperties = selected.properties.map((property) => ({ ...property, componentId: selected.id }));
    item.properties = item.remote.properties.map((remoteProperty, index) => {
      const fresh = reconcileProperty(
        remoteProperty,
        remoteProperty.id ?? `${remoteProperty.name}:${remoteProperty.type}:${index}`,
        localProperties,
        baseline?.properties ?? []
      );
      const old = previous.properties.find((candidate) => candidate.remoteKey === fresh.remoteKey);
      fresh.action = old?.action ?? fresh.action;
      fresh.matchDecision = old && old.selectedLocalId === fresh.selectedLocalId ? (old.matchDecision || fresh.matchDecision) : fresh.matchDecision;
      fresh.fields.forEach((field) => {
        field.decision = old?.fields.find((candidate) => candidate.field === field.field)?.decision ?? '';
      });
      return fresh;
    });
  }

  next.updatedAt = new Date().toISOString();
  next.status = 'open';
  return revalidateSession(next);
}

export function resolveComponentAction(session: ReconciliationSession, remoteKey: string, action: ComponentActionDecision): ReconciliationSession {
  const next = structuredClone(session);
  const item = next.components.find((candidate) => candidate.remoteKey === remoteKey);
  if (!item) return next;
  if (action === 'skip') item.matchDecision = 'skip';
  item.action = action;
  next.updatedAt = new Date().toISOString();
  next.status = 'open';
  return revalidateSession(next);
}

export function resolveComponentField(session: ReconciliationSession, remoteKey: string, field: string, decision: FieldDecision): ReconciliationSession {
  return mutateField(session, remoteKey, undefined, field, decision);
}

export function resolvePropertyMatch(
  session: ReconciliationSession,
  componentKey: string,
  propertyKey: string,
  decision: PropertyMatchDecision,
  propertyId = '',
  localComponent?: ComponentSpec,
  baselineProperties: PropertyBaselineLike[] = []
): ReconciliationSession {
  const next = structuredClone(session);
  const component = next.components.find((item) => item.remoteKey === componentKey);
  const property = component?.properties.find((item) => item.remoteKey === propertyKey);
  if (!component || !property) return next;
  const previous = structuredClone(property);
  property.matchDecision = decision;
  if (decision === 'id' || decision === 'match') property.selectedLocalId = propertyId;
  if (decision === 'create' || decision === 'skip' || decision === 'unmatched') property.selectedLocalId = undefined;

  if ((decision === 'id' || decision === 'match') && localComponent) {
    const localProperty = localComponent.properties.find((item) => item.id === propertyId);
    if (decision === 'id' && property.remote.id && localProperty?.id !== property.remote.id) return next;
    if (decision === 'match' && (!localProperty || !propertyMatches(localProperty, property.remote))) return next;
    const localProperties = localComponent.properties.map((item) => ({ ...item, componentId: localComponent.id }));
    const remoteIndex = component.properties.findIndex((candidate) => candidate.remoteKey === propertyKey);
    const fresh = reconcileProperty(property.remote, propertyKey, localProperties, baselineProperties);
    fresh.action = previous.action;
    fresh.matchDecision = decision;
    fresh.selectedLocalId = propertyId;
    fresh.fields.forEach((field) => {
      field.decision = previous.fields.find((candidate) => candidate.field === field.field)?.decision ?? '';
    });
    component.properties[remoteIndex] = fresh;
  }

  next.updatedAt = new Date().toISOString();
  next.status = 'open';
  return revalidateSession(next);
}

export function resolvePropertyAction(session: ReconciliationSession, componentKey: string, propertyKey: string, action: PropertyActionDecision): ReconciliationSession {
  const next = structuredClone(session);
  const property = next.components.find((item) => item.remoteKey === componentKey)?.properties.find((item) => item.remoteKey === propertyKey);
  if (!property) return next;
  if (action === 'skip') property.matchDecision = 'skip';
  property.action = action;
  next.updatedAt = new Date().toISOString();
  next.status = 'open';
  return revalidateSession(next);
}

export function resolvePropertyField(session: ReconciliationSession, componentKey: string, propertyKey: string, field: string, decision: FieldDecision): ReconciliationSession {
  return mutateField(session, componentKey, propertyKey, field, decision);
}

export function resolveAllConflicts(session: ReconciliationSession, side: ReconcileSide): ReconciliationSession {
  const next = structuredClone(session);
  next.components.forEach((component) => {
    if (component.state === 'conflict') {
      component.fields.forEach((field) => {
        if (field.state === 'conflict') field.decision = side;
      });
      component.properties.forEach((property) => {
        if (property.state === 'conflict') {
          property.fields.forEach((field) => {
            if (field.state === 'conflict') field.decision = side;
          });
          if (!(property.action as PropertyActionDecision)) {
            property.action = side === 'remote' ? (property.remote.removed ? 'remove' : 'update') : 'skip';
          }
        }
      });
      if (!(component.action as ComponentActionDecision)) component.action = side === 'remote' ? (component.remote.removed ? 'remove' : 'update') : 'skip';
    }
  });
  next.updatedAt = new Date().toISOString();
  next.status = 'open';
  return revalidateSession(next);
}

function mutateField(session: ReconciliationSession, componentKey: string, propertyKey: string | undefined, fieldName: string, decision: FieldDecision): ReconciliationSession {
  const next = structuredClone(session);
  const component = next.components.find((item) => item.remoteKey === componentKey);
  const target = propertyKey ? component?.properties.find((item) => item.remoteKey === propertyKey) : component;
  const field = target?.fields.find((item) => item.field === fieldName);
  if (field) field.decision = decision;
  next.updatedAt = new Date().toISOString();
  next.status = 'open';
  return revalidateSession(next);
}

function revalidateSession(session: ReconciliationSession): ReconciliationSession {
  session.components.forEach(revalidateComponent);
  return session;
}

function revalidateComponent(component: ComponentReconcile): ComponentReconcile {
  const matchReady = component.matchDecision === 'new' || component.matchDecision === 'skip'
    || ((component.matchDecision === 'id' || component.matchDecision === 'match') && Boolean(component.selectedLocalId))
    || (component.matchDecision === '' && component.localCandidates.length === 1 && Boolean(component.selectedLocalId));
  const unresolvedMatch = !matchReady;
  component.properties.forEach((property) => {
    if (property.matchDecision === 'create' || property.matchDecision === 'skip') property.selectedLocalId = undefined;
    const propertyMatchReady = property.matchDecision === 'create' || property.matchDecision === 'skip'
      || ((property.matchDecision === 'id' || property.matchDecision === 'match') && Boolean(property.selectedLocalId))
      || (property.matchDecision === '' && property.localCandidates.length === 1 && Boolean(property.selectedLocalId));
    const conflictFields = property.fields.filter((field) => field.state === 'conflict');
    const unresolvedFields = conflictFields.filter((field) => {
      if (property.action === 'skip' || property.action === 'remove') return false;
      return !field.decision;
    });
    if (!propertyMatchReady) {
      property.state = 'ambiguous';
      property.blockingReason = '请选择属性配对。';
    } else if (unresolvedFields.length) {
      property.state = 'conflict';
      property.blockingReason = `属性 ${property.remote.name} 有 ${unresolvedFields.length} 个冲突字段待裁定。`;
    } else if (!property.action) {
      property.state = 'conflict';
      property.blockingReason = `请裁定属性 ${property.remote.name}。`;
    } else if (property.action === 'skip') {
      property.state = 'unchanged';
      property.blockingReason = '';
    } else {
      property.state = 'ready';
      property.blockingReason = '';
    }
  });

  const conflictFields = component.fields.filter((field) => field.state === 'conflict');
  const unresolvedFields = conflictFields.filter((field) => {
    if (component.action === 'skip' || component.action === 'remove' || component.action === 'deprecate') return false;
    return !field.decision;
  });
  const propertyBlocked = component.properties.some((property) => property.state !== 'ready' && property.state !== 'unchanged');
  if (unresolvedMatch) {
    component.state = 'ambiguous';
    component.blockingReason = '请选择组件配对。';
  } else if (unresolvedFields.length) {
    component.state = 'conflict';
    component.blockingReason = `组件有 ${unresolvedFields.length} 个冲突字段待裁定。`;
  } else if (propertyBlocked) {
    component.state = component.properties.some((property) => property.state === 'ambiguous') ? 'ambiguous' : 'conflict';
    component.blockingReason = component.properties.find((property) => property.state !== 'ready' && property.state !== 'unchanged')?.blockingReason ?? '属性冲突未裁定。';
  } else if (!component.action) {
    component.state = 'conflict';
    component.blockingReason = '请选择组件处理动作。';
  } else if (component.action === 'skip') {
    component.state = 'unchanged';
    component.blockingReason = '';
  } else {
    component.state = 'ready';
    component.blockingReason = '';
  }
  return component;
}

export function getBlockingReasons(session: ReconciliationSession): string[] {
  return session.components.flatMap((component) => {
    revalidateComponent(component);
    if (component.state === 'ready' || component.state === 'unchanged') return [];
    const reasons = [component.blockingReason];
    component.properties.forEach((property) => {
      if (property.state === 'conflict' || property.state === 'ambiguous') reasons.push(property.blockingReason);
    });
    return reasons.filter(Boolean);
  });
}

function valueForField(field: ReconcileField, preferLocal = false): string | boolean | undefined {
  if (field.decision === 'local') return field.localValue;
  if (field.decision === 'remote') return field.remoteValue;
  return preferLocal ? (field.localValue ?? field.remoteValue) : (field.remoteValue ?? field.localValue);
}

function propertyValueForField(property: PropertyReconcile, field: string, preferLocal = false): string | boolean {
  const spec = property.fields.find((item) => item.field === field);
  const value = spec ? valueForField(spec, preferLocal) : undefined;
  if (field === 'required') return value === true;
  return String(value ?? '');
}

function recomputeA11yGuidance(component: ComponentSpec, changed: boolean): void {
  const required = component.properties.filter((item) => item.required).map((item) => item.name);
  const booleanStates = component.properties.filter((item) => item.type === 'boolean').map((item) => item.name);
  component.a11yGuidance = [
    `键盘：${component.keyboardBehavior || '待补充键盘行为。'}`,
    `读屏必须暴露组件名称；必填属性：${required.join('、') || '无'}。`,
    booleanStates.length ? `需要播报布尔状态：${booleanStates.join('、')}。` : '无额外布尔状态。',
    `交互契约：${component.interactionSignature || '待补充。'}`
  ].join('\n');
  component.a11yStale = changed;
  component.a11yStaleReason = changed ? '属性契约已变化，依赖说明已按新契约重算，请人工确认后采用。' : '';
}

function remoteToPendingComponent(item: ComponentReconcile, local: ComponentSpec | undefined): PendingReleaseComponent {
  const action = item.action as Exclude<ComponentActionDecision, ''>;
  const now = new Date().toISOString();
  const base: ComponentSpec = local ? structuredClone(local) : {
    id: item.selectedLocalId || item.remote.id || uid('component'),
    name: item.remote.name,
    category: item.remote.category ?? 'General',
    status: 'draft',
    purpose: '',
    usage: '',
    properties: [],
    states: '',
    keyboardBehavior: '',
    screenReader: '',
    disabledScenarios: '',
    interactionSignature: '',
    a11yGuidance: '',
    a11yStale: false,
    a11yStaleReason: '',
    examples: [],
    revision: 0,
    updatedAt: now,
    snapshots: []
  };

  const beforeFingerprint = contractFingerprint(base);
  const beforeIds = new Set(base.properties.map((property) => property.id));

  if (action === 'deprecate' || action === 'remove') {
    base.status = action === 'deprecate' ? 'deprecated' : base.status;
    base.updatedAt = now;
    recomputeA11yGuidance(base, false);
    return { remoteKey: item.remoteKey, componentId: base.id, action, component: base };
  }

  const record = base as unknown as Record<string, unknown>;
  item.fields.forEach((field) => {
    record[field.field] = valueForField(field, Boolean(local));
  });

  const keptProperties: PropertySpec[] = [];
  const changedPropertyKeys = new Set<string>();
  for (const property of item.properties) {
    const propertyAction = property.action === '' || property.action === 'create' ? (property.selectedLocalId ? 'update' : 'create') : property.action;
    if (propertyAction === 'skip') {
      const existing = base.properties.find((candidate) => candidate.id === property.selectedLocalId);
      if (existing) keptProperties.push(existing);
      continue;
    }
    if (propertyAction === 'remove') {
      const removed = base.properties.find((candidate) => candidate.id === property.selectedLocalId);
      if (removed) changedPropertyKeys.add(removed.name);
      continue;
    }
    const existing = base.properties.find((candidate) => candidate.id === property.selectedLocalId);
    const next: PropertySpec = existing ? structuredClone(existing) : {
      id: property.selectedLocalId || property.remote.id || uid('property'),
      name: '',
      type: 'string',
      required: false,
      defaultValue: '',
      description: ''
    };
    next.name = String(propertyValueForField(property, 'name', Boolean(existing)));
    next.type = String(propertyValueForField(property, 'type', Boolean(existing)));
    next.required = propertyValueForField(property, 'required', Boolean(existing)) === true;
    next.defaultValue = String(propertyValueForField(property, 'defaultValue', Boolean(existing)));
    next.description = String(propertyValueForField(property, 'description', Boolean(existing)));
    const wasChanged = !existing || contractFields.some((field) => {
      const old = existing ? (existing as unknown as Record<string, string | boolean>)[field] : undefined;
      return old !== (next as unknown as Record<string, string | boolean>)[field];
    });
    if (wasChanged) changedPropertyKeys.add(next.name);
    keptProperties.push(next);
  }
  base.properties = keptProperties;

  const addedOrRemoved = keptProperties.some((property) => !beforeIds.has(property.id)) || beforeIds.size !== keptProperties.length;
  const contractChanged = contractFingerprint(base) !== beforeFingerprint || addedOrRemoved || !local;
  if (contractChanged) {
    const reason = '属性契约已变化，示例依赖已失效，需要按新版本重新验证。';
    base.examples.forEach((example) => {
      const dependsOnChanged = example.propertyIds.some((id) => !keptProperties.some((property) => property.id === id))
        || example.code.split(/\s+/).some((token) => changedPropertyKeys.has(token.replace(/[=:]/g, '')));
      if (dependsOnChanged || contractChanged) {
        example.stale = true;
        example.staleReason = reason;
      }
    });
    recomputeA11yGuidance(base, true);
    base.a11yStaleReason = '属性契约变化：键盘/读屏依赖已立即重算，请人工确认后采用。';
  } else {
    recomputeA11yGuidance(base, false);
  }

  base.revision = local ? base.revision + 1 : 1;
  base.updatedAt = now;
  return { remoteKey: item.remoteKey, componentId: base.id, action, component: base };
}

export function hashState(value: unknown): string {
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `h${(hash >>> 0).toString(16)}`;
}

export function buildPendingRelease(session: ReconciliationSession, locals: ComponentSpec[], archivedComponents: ComponentSpec[]): { release?: PendingRelease; error?: string } {
  const blockers = getBlockingReasons(session);
  if (blockers.length) return { error: blockers[0] };

  const components: PendingReleaseComponent[] = [];
  for (const item of session.components) {
    if (item.action === 'skip') continue;
    const local = locals.find((component) => component.id === item.selectedLocalId)
      ?? archivedComponents.find((component) => component.id === item.selectedLocalId);
    components.push(remoteToPendingComponent(item, local));
  }

  if (!components.length) return { error: '所有项目都选择了保留本地，没有待发布内容。' };
  const now = new Date().toISOString();
  return {
    release: {
      id: uid('release'),
      packageId: session.packageId,
      packageName: session.packageName,
      packageVersion: session.packageVersion,
      sessionId: session.id,
      createdAt: now,
      baseHash: hashState({ components: locals, archivedComponents }),
      components
    }
  };
}

export type ComponentStatus = 'draft' | 'review' | 'published';
export type PreviewTheme = 'light' | 'dark';
export type PreviewDensity = 'compact' | 'regular' | 'spacious';

export interface PropertySpec {
  id: string;
  name: string;
  type: string;
  required: boolean;
  defaultValue: string;
  description: string;
}

export interface ComponentExample {
  id: string;
  title: string;
  code: string;
  propertyIds: string[];
  stale: boolean;
  staleReason: string;
  createdFromRevision: number;
}

export interface ComponentSpec {
  id: string;
  name: string;
  category: string;
  status: ComponentStatus;
  purpose: string;
  usage: string;
  properties: PropertySpec[];
  states: string;
  keyboardBehavior: string;
  screenReader: string;
  disabledScenarios: string;
  interactionSignature: string;
  examples: ComponentExample[];
  revision: number;
  updatedAt: string;
  snapshots: ComponentSnapshot[];
  a11yStale: boolean;
  a11yStaleReason: string;
}

/**
 * 规范仓（上游设计系统）下发的组件包。
 * 只携带契约字段；用途、示例、无障碍说明等本地内容不随包覆盖。
 */
export interface PackageProperty {
  /** 属性标识，可能缺失——缺失时退回名称+类型配对。 */
  id?: string;
  name: string;
  type: string;
  required: boolean;
  defaultValue: string;
  description: string;
}

export interface PackageComponent {
  /** 组件标识，可能缺失。 */
  id?: string;
  name: string;
  category: string;
  status?: ComponentStatus;
  purpose?: string;
  interactionSignature?: string;
  properties: PackageProperty[];
}

export interface SpecPackage {
  id: string;
  name: string;
  version: string;
  components: PackageComponent[];
}

/** 对账候选类型：两边都有新值 / 下架碰上改值 / 配对歧义。 */
export type ReconcileCandidateType = 'both-modified' | 'remove-vs-modify' | 'ambiguous-match';

export interface ReconcileMatch {
  /** 歧义候选项的键：本地组件 id，或包条目序号。 */
  key: string;
  label: string;
  reason: string;
}

export interface ReconcileCandidate {
  id: string;
  type: ReconcileCandidateType;
  /** 本地组件 id；歧义未定时为空。 */
  componentId: string;
  componentName: string;
  /** 包条目标识（`pkg-<序号>`），用于包→多组件歧义。 */
  pkgKey?: string;
  /** 本地属性 id（属性级候选）。 */
  propertyId?: string;
  propertyName?: string;
  /** 组件级契约字段名（组件级候选）。 */
  field?: string;
  /** 最近一次发布基线（用于判断“两边都改了”）。 */
  baseline?: Record<string, unknown>;
  packageValue: unknown;
  localValue: unknown;
  packageSource: string;
  localSource: string;
  /** 歧义候选的可选配对。 */
  matches?: ReconcileMatch[];
  decision?: string;
  status: 'pending' | 'decided';
  description: string;
}

export interface ReconcileSession {
  id: string;
  package: SpecPackage;
  startedAt: string;
  status: 'in-progress' | 'released';
  candidates: ReconcileCandidate[];
  releasedAt?: string;
  releaseSummary?: string;
}

export interface ComponentSnapshot {
  revision: number;
  savedAt: string;
  reason: string;
  component: Omit<ComponentSpec, 'snapshots'>;
}

export interface WorkspaceState {
  components: ComponentSpec[];
  selectedId: string;
}

export interface ValidationIssue {
  id: string;
  level: 'error' | 'warning' | 'info';
  componentId: string;
  target: string;
  message: string;
  field: 'properties' | 'examples' | 'keyboard' | 'screenReader';
}

export interface DiffRow {
  field: string;
  before: string;
  after: string;
}

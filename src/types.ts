export type ComponentStatus = 'draft' | 'review' | 'published' | 'deprecated';
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
  a11yGuidance?: string;
  a11yStale?: boolean;
  a11yStaleReason?: string;
  examples: ComponentExample[];
  revision: number;
  updatedAt: string;
  snapshots: ComponentSnapshot[];
}

export interface ComponentSnapshot {
  revision: number;
  savedAt: string;
  reason: string;
  component: Omit<ComponentSpec, 'snapshots'>;
}

export interface SyncBaseline {
  componentId: string;
  updatedAt: string;
  storedAt: string;
  fields: Record<string, string | boolean>;
  properties: Array<{
    id: string;
    name: string;
    type: string;
    required: boolean;
    defaultValue: string;
    description: string;
  }>;
}

export interface WorkspaceState {
  components: ComponentSpec[];
  archivedComponents: ComponentSpec[];
  selectedId: string;
  syncBaselines: SyncBaseline[];
  pendingReleases: import('./reconcile').PendingRelease[];
  lastSyncAt: string;
  reconciliationSessions: import('./reconcile').ReconciliationSession[];
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

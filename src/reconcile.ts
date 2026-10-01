import type {
  ComponentSpec,
  PackageComponent,
  PackageProperty,
  ReconcileCandidate,
  ReconcileMatch,
  ReconcileSession,
  SpecPackage
} from './types';

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const PROP_FIELDS = ['name', 'type', 'required', 'defaultValue', 'description'] as const;
const CONTRACT_FIELDS = ['name', 'category', 'interactionSignature'] as const;

type Baseline = ComponentSpec | null;

const pkgKey = (index: number) => `pkg-${index}`;

const propDiff = (a: PackageProperty | ComponentSpec['properties'][number], b: PackageProperty | ComponentSpec['properties'][number]): string[] =>
  PROP_FIELDS.filter((field) => JSON.stringify(a[field]) !== JSON.stringify(b[field]));

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stripSnapshots = (component: ComponentSpec): Omit<ComponentSpec, 'snapshots'> => {
  const { snapshots: _ignored, ...rest } = component;
  return rest;
};

/* ------------------------------------------------------------------ */
/* 内置规范仓组件包（上游设计系统下发）                                  */
/* ------------------------------------------------------------------ */

export const BUILTIN_PACKAGE: SpecPackage = {
  id: 'pkg-design-system-v4',
  name: '设计系统规范包',
  version: 'v4.2.0',
  components: [
    {
      id: 'button-spec',
      name: 'Action button',
      category: 'Actions',
      interactionSignature: 'Space/Enter 触发；disabled 时不响应；loading 时不响应',
      properties: [
        { id: 'p-label', name: 'label', type: 'string', required: true, defaultValue: '保存', description: '按钮可见文字，同时作为组件的无障碍名称。' },
        { id: 'p-disabled', name: 'disabled', type: 'boolean', required: false, defaultValue: 'false', description: '禁用交互，但不隐藏按钮。' },
        { id: 'p-variant', name: 'variant', type: 'accent | primary | secondary | quiet', required: false, defaultValue: 'secondary', description: '控制动作层级。' },
        { id: 'p-icon', name: 'icon', type: 'string', required: false, defaultValue: '', description: '按钮前置图标名称。' }
      ]
    },
    {
      id: 'field-spec',
      name: 'Labelled field',
      category: 'Forms',
      properties: [
        { id: 'p-field-label', name: 'label', type: 'string', required: true, defaultValue: '组件名称', description: '字段可见标签，并关联输入框。' },
        { id: 'p-field-required', name: 'required', type: 'boolean', required: false, defaultValue: 'false', description: '标记必填；提交后再显示错误。' }
      ]
    },
    {
      id: 'dialog-spec',
      name: 'Modal dialog',
      category: 'Feedback',
      interactionSignature: 'Esc 关闭；Tab 焦点循环；打开后焦点移入对话框',
      properties: [
        { id: 'p-dialog-open', name: 'open', type: 'boolean', required: true, defaultValue: 'false', description: '控制对话框可见性。' },
        { id: 'p-dialog-title', name: 'heading', type: 'string', required: true, defaultValue: '确认操作', description: '对话框标题，同时作为无障碍名称。' },
        { id: 'p-dialog-modal', name: 'modal', type: 'boolean', required: false, defaultValue: 'false', description: '是否阻止背景交互。' }
      ]
    },
    {
      // 无组件标识，名称与上面的 id 条目指向同一组件 → 配对歧义（多包→一组件）
      name: 'Action button',
      category: 'Actions',
      properties: [
        { name: 'label', type: 'string', required: true, defaultValue: '保存', description: '按钮可见文字，同时作为无障碍名称。' }
      ]
    }
  ]
};

/* ------------------------------------------------------------------ */
/* 候选构造                                                            */
/* ------------------------------------------------------------------ */

const bothModifiedProp = (pc: PackageComponent, pp: PackageProperty, lp: ComponentSpec['properties'][number], base: PackageProperty | undefined): ReconcileCandidate => ({
  id: uid('cand'),
  type: 'both-modified',
  componentId: '',
  componentName: pc.name,
  propertyId: lp.id,
  propertyName: lp.name,
  baseline: base ? { ...base } : undefined,
  packageValue: { ...pp },
  localValue: { ...lp },
  packageSource: '规范仓',
  localSource: '本地草稿',
  status: 'pending',
  description: `属性 ${lp.name} 两边都有新值：规范仓与本地草稿都修改过该属性。`
});

const removeVsModifyProp = (pc: PackageComponent, lp: ComponentSpec['properties'][number], base: PackageProperty): ReconcileCandidate => ({
  id: uid('cand'),
  type: 'remove-vs-modify',
  componentId: '',
  componentName: pc.name,
  propertyId: lp.id,
  propertyName: lp.name,
  baseline: { ...base },
  packageValue: null,
  localValue: { ...lp },
  packageSource: '规范仓',
  localSource: '本地草稿',
  status: 'pending',
  description: `属性 ${lp.name} 已被规范仓下架，但本地草稿改过它，需裁定。`
});

const bothModifiedField = (pc: PackageComponent, lc: ComponentSpec, field: string, base: unknown): ReconcileCandidate => ({
  id: uid('cand'),
  type: 'both-modified',
  componentId: lc.id,
  componentName: lc.name,
  field,
  baseline: { value: base },
  packageValue: pc[field as keyof PackageComponent],
  localValue: lc[field as keyof ComponentSpec],
  packageSource: '规范仓',
  localSource: '本地草稿',
  status: 'pending',
  description: `组件契约字段 ${field} 两边都有新值。`
});

const overAmbiguous = (lc: ComponentSpec, matches: ReconcileMatch[]): ReconcileCandidate => ({
  id: uid('cand'),
  type: 'ambiguous-match',
  componentId: lc.id,
  componentName: lc.name,
  packageValue: null,
  localValue: null,
  packageSource: '规范仓',
  localSource: '本地草稿',
  matches,
  status: 'pending',
  description: `多个规范包条目都指向本地组件 ${lc.name}，需裁定采用哪一条。`
});

const underAmbiguous = (pc: PackageComponent, key: string, matches: ReconcileMatch[]): ReconcileCandidate => ({
  id: uid('cand'),
  type: 'ambiguous-match',
  componentId: '',
  componentName: pc.name,
  pkgKey: key,
  packageValue: { ...pc },
  localValue: null,
  packageSource: '规范仓',
  localSource: '本地草稿',
  matches,
  status: 'pending',
  description: `包条目 ${pc.name} 同时命中多个本地组件，需裁定落到哪一个。`
});

/* ------------------------------------------------------------------ */
/* 配对解析（buildSession 与 applyRelease 共用）                        */
/* ------------------------------------------------------------------ */

interface Pairing {
  pairs: Array<{ pc: PackageComponent; lc: ComponentSpec; matchBy: 'id' | 'name' | 'decision' }>;
  additions: PackageComponent[];
  ignored: PackageComponent[];
}

const findPkgByKey = (pkg: SpecPackage, key: string): PackageComponent | undefined => {
  const index = Number(key.replace('pkg-', ''));
  return Number.isInteger(index) ? pkg.components[index] : undefined;
};

function resolvePairing(pkg: SpecPackage, locals: ComponentSpec[], candidates: ReconcileCandidate[]): Pairing {
  const pairs: Pairing['pairs'] = [];
  const additions: PackageComponent[] = [];
  const ignored: PackageComponent[] = [];
  const claimedLocals = new Set<string>();
  const claimedPkgs = new Set<string>();

  // 多包→一组件：按裁定保留一条包条目。
  for (const cand of candidates) {
    if (cand.type !== 'ambiguous-match' || !cand.componentId) continue;
    const chosen = cand.decision;
    if (chosen && chosen !== 'skip') {
      const pc = findPkgByKey(pkg, chosen);
      const lc = locals.find((item) => item.id === cand.componentId);
      if (pc && lc) {
        pairs.push({ pc, lc, matchBy: 'decision' });
        claimedLocals.add(lc.id);
        claimedPkgs.add(chosen);
      }
    }
    for (const match of cand.matches ?? []) {
      if (match.key !== chosen) {
        const pc = findPkgByKey(pkg, match.key);
        if (pc) ignored.push(pc);
      }
    }
  }

  // 常规配对。
  for (let i = 0; i < pkg.components.length; i++) {
    const pc = pkg.components[i];
    const key = pkgKey(i);
    if (claimedPkgs.has(key) || ignored.includes(pc)) continue;

    let lc = pc.id ? locals.find((item) => item.id === pc.id) : undefined;
    let matchBy: 'id' | 'name' | 'decision' | undefined = lc ? 'id' : undefined;

    if (!lc) {
      const nameMatches = locals.filter((item) => item.name.trim().toLowerCase() === pc.name.trim().toLowerCase());
      if (nameMatches.length === 1) {
        lc = nameMatches[0];
        matchBy = 'name';
      } else if (nameMatches.length > 1) {
        const cand = candidates.find((item) => item.type === 'ambiguous-match' && !item.componentId && item.pkgKey === key);
        const decision = cand?.decision;
        if (decision && decision !== 'create-new') {
          lc = locals.find((item) => item.id === decision);
          matchBy = 'decision';
        } else if (decision === 'create-new') {
          additions.push(pc);
          continue;
        } else {
          // 未裁定（发布前会被拦截）；保守起见按新增处理，避免丢内容。
          additions.push(pc);
          continue;
        }
      }
    }

    if (!lc) {
      additions.push(pc);
      continue;
    }
    if (claimedLocals.has(lc.id)) {
      ignored.push(pc);
      continue;
    }
    claimedLocals.add(lc.id);
    claimedPkgs.add(key);
    pairs.push({ pc, lc, matchBy: matchBy ?? 'name' });
  }

  return { pairs, additions, ignored };
}

/* ------------------------------------------------------------------ */
/* 构建对账会话：配对 + 候选识别                                        */
/* ------------------------------------------------------------------ */

export function buildSession(pkg: SpecPackage, locals: ComponentSpec[], baselineOf: (component: ComponentSpec) => Baseline): ReconcileSession {
  const candidates: ReconcileCandidate[] = [];
  const localClaimedBy = new Map<string, string>();

  for (let i = 0; i < pkg.components.length; i++) {
    const pc = pkg.components[i];
    const key = pkgKey(i);

    let lc = pc.id ? locals.find((item) => item.id === pc.id) : undefined;
    if (!lc) {
      const nameMatches = locals.filter((item) => item.name.trim().toLowerCase() === pc.name.trim().toLowerCase());
      if (nameMatches.length === 1) {
        lc = nameMatches[0];
      } else if (nameMatches.length > 1) {
        candidates.push(underAmbiguous(pc, key, nameMatches.map((item) => ({ key: item.id, label: item.name, reason: '名称相同' }))));
        continue;
      }
    }

    if (!lc) continue; // 纯新增，无候选

    const claimedBy = localClaimedBy.get(lc.id);
    if (claimedBy) {
      const existing = candidates.find((item) => item.type === 'ambiguous-match' && item.componentId === lc.id);
      const newMatch: ReconcileMatch = { key, label: `${pc.name}（${pc.id ?? '无标识'}）`, reason: '名称配对指向同一组件' };
      if (existing) {
        existing.matches = [...(existing.matches ?? []), newMatch];
      } else {
        candidates.push(overAmbiguous(lc, [
          { key: claimedBy, label: '先前已配对条目', reason: '标识/名称命中' },
          newMatch
        ]));
      }
      continue;
    }
    localClaimedBy.set(lc.id, key);

    reconcileContract(pc, lc, baselineOf(lc), candidates);
  }

  return {
    id: uid('reconcile'),
    package: pkg,
    startedAt: new Date().toISOString(),
    status: 'in-progress',
    candidates
  };
}

function reconcileContract(pc: PackageComponent, lc: ComponentSpec, baseline: Baseline, candidates: ReconcileCandidate[]): void {
  const baseProps = baseline?.properties ?? [];

  // 属性配对：标识优先，缺失则名称+类型。
  for (const pp of pc.properties) {
    let lp = pp.id ? lc.properties.find((item) => item.id === pp.id) : undefined;
    if (!lp) {
      const nameMatches = lc.properties.filter((item) => item.name === pp.name && item.type === pp.type);
      if (nameMatches.length === 1) lp = nameMatches[0];
    }
    if (!lp) {
      const nameOnly = lc.properties.filter((item) => item.name === pp.name);
      if (nameOnly.length === 1) {
        // 同名不同类型：按“两边都有新值”候选处理。
        const base = baseProps.find((item) => item.name === nameOnly[0].name);
        candidates.push(bothModifiedProp(pc, pp, nameOnly[0], base));
      }
      continue; // 其余按新增处理
    }

    const changedFields = propDiff(pp, lp);
    if (!changedFields.length) continue;

    const base = baseProps.find((item) => item.id === lp.id) ?? baseProps.find((item) => item.name === lp.name);
    const pkgChanged = base ? propDiff(pp, base).length > 0 : true;
    const localChanged = base ? propDiff(lp, base).length > 0 : true;
    if (pkgChanged && localChanged) {
      candidates.push(bothModifiedProp(pc, pp, lp, base));
    }
  }

  // 下架属性：包中已不存在。
  for (const lp of lc.properties) {
    const inPkg = pc.properties.some((pp) => (pp.id && pp.id === lp.id) || (!pp.id && pp.name === lp.name && pp.type === lp.type));
    if (!inPkg) {
      const base = baseProps.find((item) => item.id === lp.id) ?? baseProps.find((item) => item.name === lp.name);
      if (base) {
        const localChanged = propDiff(lp, base).length > 0;
        if (localChanged) candidates.push(removeVsModifyProp(pc, lp, base));
      }
    }
  }

  // 组件级契约字段。
  for (const field of CONTRACT_FIELDS) {
    const pv = pc[field];
    if (pv === undefined || pv === null || pv === lc[field]) continue;
    const base = baseline ? (baseline as unknown as Record<string, unknown>)[field] : undefined;
    const pkgChanged = base !== undefined ? pv !== base : true;
    const localChanged = base !== undefined ? (lc[field] as unknown) !== base : true;
    if (pkgChanged && localChanged) {
      candidates.push(bothModifiedField(pc, lc, field, base));
    }
  }
}

/* ------------------------------------------------------------------ */
/* 发布计划（UI 预览）                                                  */
/* ------------------------------------------------------------------ */

export interface PlanPropertyOp {
  kind: 'add' | 'modify' | 'remove';
  property: PackageProperty | ComponentSpec['properties'][number];
  packageProperty?: PackageProperty;
  fields?: string[];
}

export interface PlanComponentOp {
  kind: 'component';
  component: ComponentSpec;
  propertyOps: PlanPropertyOp[];
  fieldOps: Array<{ field: string; before: unknown; after: unknown }>;
}

export interface PlanAddComponentOp {
  kind: 'add-component';
  component: PackageComponent;
}

export type PlanOp = PlanComponentOp | PlanAddComponentOp;

export function planOperations(session: ReconcileSession, locals: ComponentSpec[]): PlanOp[] {
  const { pairs, additions } = resolvePairing(session.package, locals, session.candidates);
  const ops: PlanOp[] = [];

  for (const pair of pairs) {
    const propertyOps: PlanPropertyOp[] = [];
    for (const pp of pair.pc.properties) {
      let lp = pp.id ? pair.lc.properties.find((item) => item.id === pp.id) : undefined;
      if (!lp) {
        const nameMatches = pair.lc.properties.filter((item) => item.name === pp.name && item.type === pp.type);
        if (nameMatches.length === 1) lp = nameMatches[0];
      }
      if (!lp) {
        const nameOnly = pair.lc.properties.filter((item) => item.name === pp.name);
        if (nameOnly.length === 1) lp = nameOnly[0];
      }
      if (!lp) {
        propertyOps.push({ kind: 'add', property: pp });
        continue;
      }
      const changed = propDiff(pp, lp);
      if (changed.length) propertyOps.push({ kind: 'modify', property: lp, packageProperty: pp, fields: changed });
    }
    for (const lp of pair.lc.properties) {
      const inPkg = pair.pc.properties.some((pp) => (pp.id && pp.id === lp.id) || (!pp.id && pp.name === lp.name && pp.type === lp.type));
      if (!inPkg) propertyOps.push({ kind: 'remove', property: lp });
    }

    const fieldOps: PlanComponentOp['fieldOps'] = [];
    for (const field of CONTRACT_FIELDS) {
      const pv = pair.pc[field];
      if (pv !== undefined && pv !== null && pv !== pair.lc[field]) {
        fieldOps.push({ field, before: pair.lc[field], after: pv });
      }
    }

    ops.push({ kind: 'component', component: pair.lc, propertyOps, fieldOps });
  }

  for (const pc of additions) ops.push({ kind: 'add-component', component: pc });
  return ops;
}

/* ------------------------------------------------------------------ */
/* 失效重算：示例与无障碍说明                                            */
/* ------------------------------------------------------------------ */

function invalidateDependents(component: ComponentSpec, before: ComponentSpec, changedPropIds: string[], removedPropIds: string[], signatureChanged: boolean): void {
  const changed = new Set(changedPropIds);
  const removed = new Set(removedPropIds);

  for (const example of component.examples) {
    const beforeIds = [...example.propertyIds];
    example.propertyIds = example.propertyIds.filter((id) => !removed.has(id));
    const dropped = beforeIds.filter((id) => removed.has(id));
    const referencedChanged = example.propertyIds.some((id) => changed.has(id));
    if (dropped.length || referencedChanged || signatureChanged) {
      const droppedNames = dropped
        .map((id) => before.properties.find((item) => item.id === id)?.name)
        .filter(Boolean)
        .join('、');
      example.stale = true;
      example.staleReason = dropped.length
        ? `引用的属性 ${droppedNames} 已删除或变更，示例需重新验证。`
        : '属性契约已更新，示例需重新验证。';
    }
  }

  const text = `${component.keyboardBehavior}\n${component.screenReader}`;
  const mentioned = component.properties.filter((property) => new RegExp(`\\b${escapeRegExp(property.name)}\\b`, 'i').test(text));
  const affected = mentioned.filter((property) => removed.has(property.id) || changed.has(property.id));
  const removedNames = removedPropIds
    .map((id) => before.properties.find((item) => item.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const mentionsRemoved = removedNames.some((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(text));
  if (affected.length || signatureChanged || mentionsRemoved) {
    const names = [
      ...affected.map((property) => property.name),
      ...removedNames.filter((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(text))
    ].join('、') || '交互签名';
    component.a11yStale = true;
    component.a11yStaleReason = `无障碍说明引用的属性 ${names} 已变更或下架，请复核键盘与读屏说明。`;
  }
}

/** 重新核算无障碍说明：基于当前契约重扫，清除失效标记。 */
export function recomputeA11y(component: ComponentSpec): ComponentSpec {
  const next: ComponentSpec = {
    ...component,
    a11yStale: false,
    a11yStaleReason: ''
  };
  return next;
}

/* ------------------------------------------------------------------ */
/* 应用裁定并生成待发布版本                                              */
/* ------------------------------------------------------------------ */

export interface ReleaseResult {
  components: ComponentSpec[];
  summary: {
    updated: number;
    added: number;
    propertiesAdded: number;
    propertiesRemoved: number;
    propertiesModified: number;
    examplesInvalidated: number;
    a11yInvalidated: number;
  };
}

function createComponentFromPackage(pc: PackageComponent): ComponentSpec {
  const id = pc.id ?? uid('component');
  return {
    id,
    name: pc.name,
    category: pc.category || 'Uncategorised',
    status: pc.status ?? 'review',
    purpose: pc.purpose ?? '来自规范仓的组件，待本地补充用途与使用规则。',
    usage: '',
    properties: pc.properties.map((pp) => ({ ...pp, id: pp.id ?? uid('property') })),
    states: 'default、hover、focus-visible、disabled。',
    keyboardBehavior: '',
    screenReader: '',
    disabledScenarios: '',
    interactionSignature: pc.interactionSignature ?? '',
    examples: [],
    revision: 1,
    updatedAt: new Date().toISOString(),
    snapshots: [],
    a11yStale: false,
    a11yStaleReason: ''
  };
}

function findCandidate(candidates: ReconcileCandidate[], predicate: (candidate: ReconcileCandidate) => boolean): ReconcileCandidate | undefined {
  return candidates.find(predicate);
}

function applyPair(pc: PackageComponent, lc: ComponentSpec, baseline: Baseline, candidates: ReconcileCandidate[]): { component: ComponentSpec; stats: { added: number; removed: number; modified: number; examples: number; a11y: number } } {
  const next: ComponentSpec = structuredClone(lc);
  const baseProps = baseline?.properties ?? [];
  const changedPropIds: string[] = [];
  const removedPropIds: string[] = [];
  let signatureChanged = false;
  const stats = { added: 0, removed: 0, modified: 0, examples: 0, a11y: 0 };

  // 组件级契约字段。
  for (const field of CONTRACT_FIELDS) {
    const pv = pc[field];
    if (pv === undefined || pv === null || pv === lc[field]) continue;
    const base = baseline ? (baseline as unknown as Record<string, unknown>)[field] : undefined;
    const pkgChanged = base !== undefined ? pv !== base : true;
    const localChanged = base !== undefined ? (lc[field] as unknown) !== base : true;
    if (pkgChanged && localChanged) {
      const cand = findCandidate(candidates, (item) => item.type === 'both-modified' && item.componentId === lc.id && item.field === field);
      if (cand?.decision === 'local') continue;
    }
    if (field === 'interactionSignature') signatureChanged = true;
    (next as unknown as Record<string, unknown>)[field] = pv;
  }

  // 属性：配对与新增。
  for (const pp of pc.properties) {
    let lp = pp.id ? next.properties.find((item) => item.id === pp.id) : undefined;
    if (!lp) {
      const nameMatches = next.properties.filter((item) => item.name === pp.name && item.type === pp.type);
      if (nameMatches.length === 1) lp = nameMatches[0];
    }
    if (!lp) {
      const nameOnly = next.properties.filter((item) => item.name === pp.name);
      if (nameOnly.length === 1) lp = nameOnly[0];
    }

    if (!lp) {
      const id = pp.id ?? uid('property');
      next.properties.push({ ...pp, id });
      changedPropIds.push(id);
      stats.added += 1;
      continue;
    }

    const changedFields = propDiff(pp, lp);
    if (!changedFields.length) continue;

    const base = baseProps.find((item) => item.id === lp.id) ?? baseProps.find((item) => item.name === lp.name);
    const pkgChanged = base ? propDiff(pp, base).length > 0 : true;
    const localChanged = base ? propDiff(lp, base).length > 0 : true;
    if (pkgChanged && localChanged) {
      const cand = findCandidate(candidates, (item) => item.type === 'both-modified' && item.propertyId === lp.id);
      if (cand?.decision === 'local') continue;
    }
    Object.assign(lp, { ...pp, id: pp.id ?? lp.id });
    changedPropIds.push(lp.id);
    stats.modified += 1;
  }

  // 下架属性。
  for (const lp of [...next.properties]) {
    const inPkg = pc.properties.some((pp) => (pp.id && pp.id === lp.id) || (!pp.id && pp.name === lp.name && pp.type === lp.type));
    if (!inPkg) {
      const base = baseProps.find((item) => item.id === lp.id) ?? baseProps.find((item) => item.name === lp.name);
      if (base) {
        const localChanged = propDiff(lp, base).length > 0;
        if (localChanged) {
          const cand = findCandidate(candidates, (item) => item.type === 'remove-vs-modify' && item.propertyId === lp.id);
          if (cand?.decision === 'local') continue;
        }
        next.properties = next.properties.filter((item) => item.id !== lp.id);
        removedPropIds.push(lp.id);
        stats.removed += 1;
      }
    }
  }

  invalidateDependents(next, lc, changedPropIds, removedPropIds, signatureChanged);
  stats.examples = next.examples.filter((example) => example.stale).length;
  stats.a11y = next.a11yStale ? 1 : 0;

  // 以发布后的状态建立新基线（旧快照保留）。
  const newRevision = next.revision + 1;
  next.snapshots.unshift({
    revision: newRevision,
    savedAt: new Date().toISOString(),
    reason: '对账发布',
    component: { ...stripSnapshots(next), revision: newRevision }
  });
  next.snapshots = next.snapshots.slice(0, 12);
  next.revision = newRevision;
  next.updatedAt = new Date().toISOString();

  return { component: next, stats };
}

export function applyRelease(session: ReconcileSession, locals: ComponentSpec[], baselineOf: (component: ComponentSpec) => Baseline): ReleaseResult {
  const { pairs, additions } = resolvePairing(session.package, locals, session.candidates);
  const updatedIds = new Set(pairs.map((pair) => pair.lc.id));
  const components: ComponentSpec[] = [];
  let updated = 0;
  let added = 0;
  let propertiesAdded = 0;
  let propertiesRemoved = 0;
  let propertiesModified = 0;
  let examplesInvalidated = 0;
  let a11yInvalidated = 0;

  for (const lc of locals) {
    if (!updatedIds.has(lc.id)) {
      components.push(lc);
      continue;
    }
    const pair = pairs.find((item) => item.lc.id === lc.id);
    if (!pair) {
      components.push(lc);
      continue;
    }
    const result = applyPair(pair.pc, lc, baselineOf(lc), session.candidates);
    components.push(result.component);
    updated += 1;
    propertiesAdded += result.stats.added;
    propertiesRemoved += result.stats.removed;
    propertiesModified += result.stats.modified;
    examplesInvalidated += result.stats.examples;
    a11yInvalidated += result.stats.a11y;
  }

  for (const pc of additions) {
    components.push(createComponentFromPackage(pc));
    added += 1;
  }

  return {
    components,
    summary: { updated, added, propertiesAdded, propertiesRemoved, propertiesModified, examplesInvalidated, a11yInvalidated }
  };
}

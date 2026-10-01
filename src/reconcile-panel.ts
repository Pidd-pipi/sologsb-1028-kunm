import { LitElement, css, html, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { planOperations, type PlanOp } from './reconcile';
import type { SpecStore } from './store';
import type { ReconcileCandidate, SpecPackage } from './types';

const PROP_FIELDS = ['name', 'type', 'required', 'defaultValue', 'description'] as const;

export class SpecReconcilePanel extends LitElement {
  static properties = {
    showImport: { state: true },
    jsonText: { state: true },
    jsonError: { state: true }
  };

  store!: SpecStore;
  private showImport = false;
  private jsonText = '';
  private jsonError = '';

  static styles = css`
    :host { display: block; }
    * { box-sizing: border-box; }
    .panel { border: 1px solid var(--spectrum-gray-300); border-radius: 16px; background: var(--spectrum-gray-50); padding: 20px; box-shadow: 0 8px 26px rgb(20 30 50 / .06); }
    .panel + .panel { margin-top: 16px; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
    .head h2 { margin: 0; font-size: 20px; letter-spacing: -.02em; }
    .head .meta { color: var(--spectrum-gray-700); font-size: 12px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    button { font: inherit; }
    .btn { border: 1px solid var(--spectrum-gray-400); border-radius: 8px; background: var(--spectrum-gray-50); color: var(--spectrum-gray-900); padding: 8px 14px; cursor: pointer; }
    .btn:hover { background: var(--spectrum-gray-200); }
    .btn.accent { background: var(--spectrum-blue-700); border-color: var(--spectrum-blue-700); color: white; }
    .btn.accent:hover { background: var(--spectrum-blue-800); }
    .btn.accent:disabled { background: var(--spectrum-gray-300); border-color: var(--spectrum-gray-300); cursor: not-allowed; color: var(--spectrum-gray-700); }
    .summary { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
    .stat { border: 1px solid var(--spectrum-gray-300); border-radius: 10px; padding: 10px 14px; background: var(--spectrum-gray-100); min-width: 110px; }
    .stat b { display: block; font-size: 22px; }
    .stat span { font-size: 11px; color: var(--spectrum-gray-700); }
    .candidate { border: 1px solid var(--spectrum-gray-300); border-radius: 12px; padding: 14px; margin-bottom: 12px; background: var(--spectrum-gray-75, var(--spectrum-gray-100)); }
    .candidate.pending { border-left: 4px solid var(--spectrum-orange-600); }
    .candidate.decided { border-left: 4px solid var(--spectrum-green-600); }
    .cand-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
    .cand-head strong { font-size: 15px; }
    .badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 2px 9px; font-size: 10px; font-weight: 700; }
    .badge.both { background: var(--spectrum-orange-300); }
    .badge.remove { background: var(--spectrum-red-300); }
    .badge.ambiguous { background: var(--spectrum-blue-300); }
    .badge.decided { background: var(--spectrum-green-300); }
    .cand-desc { color: var(--spectrum-gray-700); font-size: 12px; margin: 0 0 10px; }
    .diff { display: grid; gap: 6px; margin-bottom: 10px; }
    .diff-row { border: 1px solid var(--spectrum-gray-300); border-radius: 8px; padding: 8px 10px; font-size: 11px; background: var(--spectrum-gray-50); }
    .diff-row b { display: block; margin-bottom: 3px; text-transform: capitalize; }
    .vals { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .vals .pkg { color: var(--spectrum-green-900); }
    .vals .loc { color: var(--spectrum-blue-900); }
    .vals .base { color: var(--spectrum-gray-700); grid-column: 1 / -1; }
    .decision { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 6px; }
    .decision label { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }
    .op { border: 1px solid var(--spectrum-gray-300); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; font-size: 12px; background: var(--spectrum-gray-50); }
    .op-head { display: flex; align-items: center; gap: 8px; font-weight: 700; margin-bottom: 4px; }
    .tag { font-size: 10px; padding: 1px 7px; border-radius: 999px; font-weight: 700; }
    .tag.add { background: var(--spectrum-green-300); }
    .tag.modify { background: var(--spectrum-orange-300); }
    .tag.remove { background: var(--spectrum-red-300); }
    .tag.component { background: var(--spectrum-blue-300); }
    .op ul { margin: 4px 0 0; padding-left: 18px; color: var(--spectrum-gray-800); }
    .empty { padding: 28px; border: 1px dashed var(--spectrum-gray-400); border-radius: 12px; text-align: center; color: var(--spectrum-gray-700); }
    .banner { border-radius: 10px; padding: 10px 14px; margin-bottom: 14px; font-size: 13px; }
    .banner.info { background: var(--spectrum-blue-200); }
    .banner.warn { background: var(--spectrum-orange-200); }
    .banner.success { background: var(--spectrum-green-200); }
    textarea { width: 100%; min-height: 140px; border: 1px solid var(--spectrum-gray-400); border-radius: 8px; padding: 9px; font: inherit; font-family: ui-monospace, monospace; font-size: 12px; }
    .import-row { display: flex; gap: 8px; margin-top: 10px; }
    .err { color: var(--spectrum-red-800); font-size: 12px; margin-top: 8px; }
    .released { font-size: 13px; line-height: 1.7; }
    .released code { background: var(--spectrum-gray-200); padding: 1px 5px; border-radius: 4px; }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.store.addEventListener('change', this.onStoreChange);
  }

  disconnectedCallback() {
    this.store.removeEventListener('change', this.onStoreChange);
    super.disconnectedCallback();
  }

  private onStoreChange = () => {
    this.requestUpdate();
  };

  protected render(): TemplateResult {
    const session = this.store.reconcileSession;
    return html`
      <section class="panel">
        <div class="head">
          <div>
            <h2>跨仓对账</h2>
            <div class="meta">规范仓组件包 × 编辑台本地草稿 · 标识优先配对，缺失则名称+类型确认</div>
          </div>
          <div class="actions">
            <button class="btn" @click=${() => this.store.loadBuiltinPackage()}>载入规范包</button>
            <button class="btn" @click=${() => { this.showImport = !this.showImport; }}>粘贴 JSON 导入</button>
          </div>
        </div>

        ${this.showImport ? html`
          <div>
            <textarea .value=${this.jsonText} placeholder='粘贴规范包 JSON，例如 { "id": "...", "components": [...] }' @input=${(e: Event) => { this.jsonText = (e.currentTarget as HTMLTextAreaElement).value; }}></textarea>
            ${this.jsonError ? html`<div class="err">${this.jsonError}</div>` : nothing}
            <div class="import-row">
              <button class="btn accent" @click=${this.importJson}>导入并对账</button>
              <button class="btn" @click=${() => { this.showImport = false; this.jsonError = ''; }}>取消</button>
            </div>
          </div>
        ` : nothing}

        ${!session ? this.renderEmpty() : session.status === 'released' ? this.renderReleased() : this.renderInProgress()}
      </section>
    `;
  }

  private renderEmpty(): TemplateResult {
    return html`
      <div class="empty">
        尚未载入规范包。点击「载入规范包」拉取上游组件包，系统会先按组件标识、属性标识配对，标识缺失再用名称和类型确认；两边都有新值、下架碰上改值或一份包落到多个组件时会列出候选，裁定后才能发布。
      </div>
    `;
  }

  private renderInProgress(): TemplateResult {
    const session = this.store.reconcileSession!;
    const pending = session.candidates.filter((c) => c.status === 'pending').length;
    const decided = session.candidates.length - pending;
    const ops = planOperations(session, this.store.state.components);
    const stats = this.computeStats(ops);

    return html`
      ${session.startedAt ? html`<div class="banner info">继续上次对账（${new Date(session.startedAt).toLocaleString('zh-CN')}）：剩余 ${pending} 个候选未裁定。</div>` : nothing}

      <div class="summary">
        <div class="stat"><b>${session.package.components.length}</b><span>规范包组件</span></div>
        <div class="stat"><b>${stats.matched}</b><span>已配对</span></div>
        <div class="stat"><b>${stats.added}</b><span>新增组件</span></div>
        <div class="stat"><b>${session.candidates.length}</b><span>候选总数 · 已裁定 ${decided}</span></div>
      </div>

      <h3 style="margin: 18px 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: .06em;">候选清单（未裁定完不能发布）</h3>
      ${session.candidates.length ? repeat(session.candidates, (c) => c.id, (candidate) => this.renderCandidate(candidate)) : html`<div class="banner success">没有冲突候选，可直接生成待发布版本。</div>`}

      <h3 style="margin: 18px 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: .06em;">发布计划</h3>
      ${ops.length ? ops.map((op) => this.renderOp(op)) : html`<div class="empty">无变更。</div>`}

      <div class="actions" style="margin-top: 16px;">
        <button class="btn accent" ?disabled=${pending > 0} @click=${this.applyRelease}>生成待发布版本</button>
        <button class="btn" @click=${() => this.store.discardReconcile()}>放弃本次对账</button>
        ${pending > 0 ? html`<span class="meta" style="align-self: center; color: var(--spectrum-orange-800);">还有 ${pending} 个候选未裁定</span>` : nothing}
      </div>
    `;
  }

  private renderReleased(): TemplateResult {
    const session = this.store.reconcileSession!;
    return html`
      <div class="banner success">已生成待发布版本（${session.releasedAt ? new Date(session.releasedAt).toLocaleString('zh-CN') : ''}）。</div>
      <div class="released">
        <p>${session.releaseSummary}</p>
        <p>属性契约变化已立即重算依赖示例与无障碍说明，旧快照继续保留。可在「版本与迁移」面板查看差异。</p>
      </div>
      <div class="actions" style="margin-top: 14px;">
        <button class="btn accent" @click=${() => this.store.loadBuiltinPackage()}>开始新一轮对账</button>
        <button class="btn" @click=${() => this.store.discardReconcile()}>关闭对账</button>
      </div>
    `;
  }

  private renderCandidate(candidate: ReconcileCandidate): TemplateResult {
    const typeLabel = { 'both-modified': '两边都有新值', 'remove-vs-modify': '下架碰上改值', 'ambiguous-match': '配对歧义' }[candidate.type];
    const typeClass = { 'both-modified': 'both', 'remove-vs-modify': 'remove', 'ambiguous-match': 'ambiguous' }[candidate.type];
    return html`
      <div class="candidate ${candidate.status}">
        <div class="cand-head">
          <span class="badge ${typeClass}">${typeLabel}</span>
          ${candidate.status === 'decided' ? html`<span class="badge decided">已裁定</span>` : nothing}
          <strong>${candidate.componentName}${candidate.propertyName ? ` · ${candidate.propertyName}` : ''}${candidate.field ? ` · ${candidate.field}` : ''}</strong>
        </div>
        <p class="cand-desc">${candidate.description}</p>
        ${candidate.type === 'ambiguous-match' ? this.renderAmbiguousDecision(candidate) : this.renderValueDecision(candidate)}
      </div>
    `;
  }

  private renderValueDecision(candidate: ReconcileCandidate): TemplateResult {
    const isProperty = !!candidate.propertyId;
    const decision = candidate.decision;
    return html`
      <div class="diff">
        ${isProperty ? this.renderPropertyDiff(candidate) : this.renderFieldDiff(candidate)}
      </div>
      <div class="decision">
        ${candidate.type === 'remove-vs-modify' ? html`
          <label><input type="radio" name="${candidate.id}" ?checked=${decision === 'package'} @change=${() => this.store.adjudicate(candidate.id, 'package')} /> 规范仓下架（本地改值作废）</label>
          <label><input type="radio" name="${candidate.id}" ?checked=${decision === 'local'} @change=${() => this.store.adjudicate(candidate.id, 'local')} /> 保留本地改值（忽略下架）</label>
        ` : html`
          <label><input type="radio" name="${candidate.id}" ?checked=${decision === 'package'} @change=${() => this.store.adjudicate(candidate.id, 'package')} /> 采用规范仓值</label>
          <label><input type="radio" name="${candidate.id}" ?checked=${decision === 'local'} @change=${() => this.store.adjudicate(candidate.id, 'local')} /> 保留本地草稿值</label>
        `}
      </div>
    `;
  }

  private renderAmbiguousDecision(candidate: ReconcileCandidate): TemplateResult {
    const decision = candidate.decision;
    const isUnder = !candidate.componentId;
    return html`
      <div class="decision" style="flex-direction: column; align-items: flex-start; gap: 8px;">
        ${(candidate.matches ?? []).map((match) => html`
          <label>
            <input type="radio" name="${candidate.id}" ?checked=${decision === match.key} @change=${() => this.store.adjudicate(candidate.id, match.key)} />
            ${match.label} <span style="color: var(--spectrum-gray-700);">— ${match.reason}</span>
          </label>
        `)}
        ${isUnder ? html`<label><input type="radio" name="${candidate.id}" ?checked=${decision === 'create-new'} @change=${() => this.store.adjudicate(candidate.id, 'create-new')} /> 作为新组件加入</label>` : nothing}
        ${!isUnder ? html`<label><input type="radio" name="${candidate.id}" ?checked=${decision === 'skip'} @change=${() => this.store.adjudicate(candidate.id, 'skip')} /> 跳过此包条目</label>` : nothing}
      </div>
    `;
  }

  private renderPropertyDiff(candidate: ReconcileCandidate): TemplateResult {
    const base = candidate.baseline as Record<string, unknown> | undefined;
    const pkg = candidate.packageValue as Record<string, unknown> | null;
    const loc = candidate.localValue as Record<string, unknown> | null;
    const fields = PROP_FIELDS.filter((f) => JSON.stringify(pkg?.[f]) !== JSON.stringify(loc?.[f]));
    return html`
      ${base ? html`<div class="vals"><div class="base">基线（最近发布）：${this.formatObject(base)}</div></div>` : nothing}
      ${fields.map((field) => html`
        <div class="diff-row">
          <b>${field}</b>
          <div class="vals">
            <div class="pkg">规范仓：${this.formatValue(pkg?.[field])}</div>
            <div class="loc">本地草稿：${this.formatValue(loc?.[field])}</div>
          </div>
        </div>
      `)}
      ${candidate.type === 'remove-vs-modify' ? html`<div class="diff-row"><b>规范仓</b><div class="pkg">已下架（属性不存在）</div></div>` : nothing}
    `;
  }

  private renderFieldDiff(candidate: ReconcileCandidate): TemplateResult {
    const base = candidate.baseline as { value?: unknown } | undefined;
    return html`
      ${base?.value !== undefined ? html`<div class="vals"><div class="base">基线：${this.formatValue(base.value)}</div></div>` : nothing}
      <div class="diff-row">
        <b>${candidate.field}</b>
        <div class="vals">
          <div class="pkg">规范仓：${this.formatValue(candidate.packageValue)}</div>
          <div class="loc">本地草稿：${this.formatValue(candidate.localValue)}</div>
        </div>
      </div>
    `;
  }

  private renderOp(op: PlanOp): TemplateResult {
    if (op.kind === 'add-component') {
      return html`
        <div class="op">
          <div class="op-head"><span class="tag add">新增组件</span> ${op.component.name} <span class="meta" style="font-weight: 400;">${op.component.id ?? '无标识'} · ${op.component.properties.length} 个属性</span></div>
        </div>
      `;
    }
    return html`
      <div class="op">
        <div class="op-head"><span class="tag component">更新</span> ${op.component.name}</div>
        ${op.fieldOps.map((fieldOp) => html`<div style="font-size: 11px; color: var(--spectrum-gray-700);">契约字段 <code>${fieldOp.field}</code>：${this.formatValue(fieldOp.before)} → ${this.formatValue(fieldOp.after)}</div>`)}
        ${op.propertyOps.length ? html`<ul>
          ${op.propertyOps.map((propOp) => html`<li><span class="tag ${propOp.kind}">${propOp.kind === 'add' ? '新增' : propOp.kind === 'modify' ? '修改' : '下架'}</span> ${this.propertyName(propOp.property)}${propOp.fields ? `（${propOp.fields.join('、')}）` : ''}</li>`)}
        </ul>` : nothing}
      </div>
    `;
  }

  private computeStats(ops: PlanOp[]): { matched: number; added: number } {
    const matched = ops.filter((op) => op.kind === 'component').length;
    const added = ops.filter((op) => op.kind === 'add-component').length;
    return { matched, added };
  }

  private propertyName(property: { name?: string } | null | undefined): string {
    return property?.name ?? '（未命名）';
  }

  private formatValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '（空）';
    if (typeof value === 'boolean') return value ? '是' : '否';
    return String(value);
  }

  private formatObject(value: Record<string, unknown>): string {
    return PROP_FIELDS.filter((f) => value[f] !== undefined).map((f) => `${f}=${this.formatValue(value[f])}`).join('，');
  }

  private async importJson() {
    try {
      const pkg = JSON.parse(this.jsonText) as SpecPackage;
      if (!pkg || !Array.isArray(pkg.components)) throw new Error('invalid');
      this.store.loadReconcilePackage(pkg);
      this.jsonError = '';
      this.jsonText = '';
      this.showImport = false;
    } catch {
      this.jsonError = '无法解析：请粘贴合法的规范包 JSON（需包含 components 数组）。';
    }
  }

  private applyRelease() {
    const ok = this.store.applyRelease();
    if (!ok) {
      // lastError is set in store; panel re-renders via change event.
    }
  }
}

customElements.define('spec-reconcile-panel', SpecReconcilePanel);

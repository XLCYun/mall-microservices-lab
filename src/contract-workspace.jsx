import React from 'react';
import { Board, ChoiceButtons } from './lesson-controls.jsx';
import { ControlIcon, StoryCard } from './walkthrough.jsx';

const lab = () => window.Lab.scenes.contract;
const intro = {
  id: 'intro', label: '消费者与提供者', title: '什么是契约测试？',
  lead: '契约写明调用方会发什么请求、期望什么响应。发布库存接口前，可以按契约核对状态码、字段和类型，检查这次改动是否影响调用方。',
  bullets: [
    ['消费者驱动', <>调用方先写下自己的需求。订单服务需要库存数量 <code>stock</code>，商品服务需要有货标记 <code>available</code>。库存服务分别验证这两份契约。</>],
    ['提供者驱动', '库存服务先公布一份接口契约，并验证实现符合约定。订单和商品服务按这份契约接入。']
  ]
};

export function ContractOverview({ state, onAction }) {
  const { people, roles } = lab();
  return <>
    <StoryCard sceneId="contract" chapter={1} slide={intro}>
      <Board title="谁在使用库存接口？">
        <div className="ct-dependency-map">
          <ul className="ct-callers" aria-label="库存接口的消费者">{people.map(id => {
            const role = roles[id];
            return <li key={id}><strong>{role.name}</strong><code>{role.field} · {role.type}</code><small>{role.expects}</small></li>;
          })}</ul>
          <span className="ct-connector" aria-hidden="true" />
          <div className="ct-inventory"><small>提供者</small><strong>库存服务</strong></div>
        </div>
        <div className="lesson-calculation"><span>两个消费者调用同一接口</span><code>POST /inventory/check</code></div>
      </Board>
    </StoryCard>
    <header className="ct-experiment-heading">
      <h2>验证库存接口的兼容性</h2>
      <p>先读两份契约，选择“原始实现”并运行验证。切换到“字段改名”，看 <code>stock</code> 改为 <code>quantity</code> 后哪个服务受影响。再试试只新增 <code>warehouse</code> 的版本。</p>
    </header>
    <div className="ct-workbench">
      <ContractEditor state={state} act={onAction} />
      <RunControls state={state} act={onAction} />
    </div>
  </>;
}

const statusLabels = { pass: '通过', fail: '失败', invalid: '契约有误', blocked: '未执行', pending: '待验证' };
const marks = { pass: '✓', fail: '×', invalid: '!', blocked: '—', pending: '·' };

function Verdict({ check, live = false }) {
  const status = check?.status || 'pending';
  const label = live && status === 'pass' ? '可用' : live && status === 'fail' ? '受影响' : statusLabels[status];
  return <span className="ct-verdict" data-status={status}><i aria-hidden="true">{marks[status]}</i>{label}</span>;
}

const steps = ['读取两份契约', '用测试桩检查调用代码', '核对库存接口响应'];

function checkStatus(checks) {
  const statuses = Object.values(checks).map(check => check.status);
  if (statuses.includes('invalid') || statuses.includes('fail')) return 'fail';
  return statuses.includes('blocked') ? 'blocked' : 'pass';
}

function RunProgress({ state }) {
  const invalidFile = lab().people.some(id => state.errors[id]);
  const outcomes = [invalidFile ? 'fail' : 'pass', checkStatus(state.consumerChecks), checkStatus(state.providerChecks)];
  let note = '';
  if (invalidFile) note = '请按上方契约中的提示修改 YAML。';
  else if (state.manual === 'consumer') note = '已用契约的示例响应检查调用代码。';
  else if (state.manual === 'provider') note = '已重放请求并核对库存接口响应。';
  return <div className="ct-progress">
    <ol aria-label="契约验证步骤">{steps.map((name, i) => {
      const status = i < state.phase ? outcomes[i] : 'pending';
      return <li key={name} data-status={status} aria-current={state.phase === i + 1 ? 'step' : undefined}>
        <span aria-hidden="true">{status === 'pending' ? i + 1 : marks[status]}</span>
        {name}<small className="visually-hidden">，{statusLabels[status]}</small>
      </li>;
    })}</ol>{note && <p role="status">{note}</p>}
  </div>;
}

function RunControls({ state, act }) {
  const options = lab().versions.map(([key, title]) => [key, title.split(' · ')[0]]);
  return <section className="ct-run-panel" aria-label="实验操作">
    <div className="ct-runbar">
      <ChoiceButtons label="库存接口版本" options={options} value={state.version} onChange={v => act('contract-version', v)} />
      <div className="ct-actions"><button className="ct-button primary" type="button" onClick={() => act('contract-run')}>
        <ControlIcon name="play" />运行验证</button>
        <button className="ct-button" type="button" onClick={() => act('contract-next')}>{state.phase === 3 ? '从头单步' : '下一步'}</button>
      </div>
    </div>
    <RunProgress state={state} />
  </section>;
}

function CompatibilityReport({ state, act, checks }) {
  const { people, roles, impacted } = lab();
  const problem = checks.find(([, c]) => c.status === 'fail' || c.status === 'invalid');
  const affected = impacted(state).length;
  return <section className="ct-panel ct-report" aria-labelledby="ct-report-title">
    <header className="ct-panel-head"><h3 id="ct-report-title">消费者验证结果</h3>
      {state.own && <span role="status">实际接入 · {affected ? affected + ' 个消费者受影响' : '两个消费者均可用'}</span>}</header>
    <table className="ct-results-table"><caption className="visually-hidden">比较测试桩、契约重放和标准查询的实际接入结果</caption>
      <thead><tr><th scope="col">消费者</th><th scope="col">测试桩</th><th scope="col">契约重放</th><th scope="col">实际接入</th></tr></thead>
      <tbody>{people.map(id => <tr key={id} data-selected={state.tab === id}>
        <th scope="row"><button type="button" className="ct-consumer-link" aria-pressed={state.tab === id} aria-controls="ct-response"
          aria-label={'查看' + roles[id].name + '契约响应'} onClick={() => act('contract-doc', id)}>{roles[id].name}</button><code>{roles[id].field}</code></th>
        <td><Verdict check={state.consumerChecks[id]} /></td>
        <td><Verdict check={state.providerChecks[id]} /></td>
        <td><Verdict check={state.liveChecks[id]} live /></td></tr>)}</tbody>
    </table>
    <div className="ct-provider-summary"><span>库存接口自测 {state.own && <b>{state.own.count}/3</b>} <Verdict check={state.own} /></span></div>
    {problem && <p className="ct-problem-note" role="status"><strong>{problem[0]}</strong> {problem[1].note}</p>}
  </section>;
}

function ResponsePreview({ state }) {
  const { responsePreview, activeDoc, docName } = lab();
  const { request, actual, replayed } = responsePreview(state);
  return <section id="ct-response" className="ct-panel ct-response" aria-labelledby="ct-response-title">
    <header className="ct-panel-head"><h3 id="ct-response-title">库存接口响应</h3>
      <span>{replayed ? docName(activeDoc(state)) + '重放' : '标准查询预览'}</span></header>
    <div className="ct-response-body">
      <div className="ct-request-line"><code>{request.method} {request.url}</code><span>HTTP {actual.status}</span></div>
      <p>请求体 <code>{JSON.stringify(request.body)}</code></p>
      <pre aria-label="库存接口响应 JSON"><code>{JSON.stringify(actual.body, null, 2)}</code></pre>
    </div>
  </section>;
}

function ContractEditor({ state, act }) {
  const { people, docName } = lab();
  return <section className="ct-panel ct-editor" aria-labelledby="ct-editor-title">
    <header className="ct-panel-head"><h3 id="ct-editor-title">库存接口契约</h3><span>Spring Cloud Contract · YAML</span></header>
    <div className="ct-editor-layout">
      {people.map(id => {
        const yaml = state.drafts[id];
        const error = state.errors[id];
        return <div className="ct-editor-code" key={id}>
          <div className="ct-file-heading"><label htmlFor={'ct-yaml-' + id}>{docName(id)}</label><code>{id}.yml</code></div>
          <textarea id={'ct-yaml-' + id} value={yaml} aria-describedby={'ct-diagnostic-' + id} aria-invalid={Boolean(error)}
            spellCheck={false} autoCapitalize="off" autoComplete="off" wrap="off" rows={22} maxLength={16384}
            onChange={event => act('contract-yaml', { id, yaml: event.target.value })} />
          <div className="ct-editor-footer"><span id={'ct-diagnostic-' + id} role="status" data-error={Boolean(error)}>
            {error || '语法通过 · ' + yaml.split(/\r\n?|\n/).length + ' 行'}</span>
            <button type="button" className="ct-text-button" aria-label={'恢复' + docName(id) + '示例'}
              onClick={() => act('contract-restore', { id })}>恢复示例</button></div>
        </div>;
      })}
    </div>
    <aside className="ct-editor-guide" aria-labelledby="ct-guide-title">
      <h4 id="ct-guide-title">语法说明</h4>
      <div><p><code>request</code> 约定发出的请求，<code>response</code> 约定响应。测试桩（Stub）用响应示例回答请求。可以试试有库存的 SKU-042（12 件）和缺货的 SKU-007（0 件）。</p>
        <p><code>by_type</code> 检查类型，<code>by_regex</code> 匹配整个字符串。其余约定字段按值比较，响应可以包含额外字段。</p>
        <p>编辑器支持 HTTP 契约的 YAML 子集。每层缩进两个空格，请求头和正文支持单层字段。</p></div>
    </aside>
  </section>;
}

export function ContractWorkspace({ state, onAction }) {
  const { people, roles, docName } = lab();
  const checks = [
    ...Object.entries(state.providerChecks).map(([id, check]) => [docName(id) + '重放', check]),
    ...people.map(id => [roles[id].name + '测试桩', state.consumerChecks[id]]),
    ...people.map(id => [roles[id].name + '实际接入', state.liveChecks[id]]),
    ['库存接口自测', state.own]
  ].filter(([, check]) => check);
  return <div className="ct-workbench">
    <div className="ct-result-layout"><CompatibilityReport state={state} act={onAction} checks={checks} /><ResponsePreview state={state} /></div>
    <section className="ct-panel ct-log" aria-labelledby="ct-log-title">
      <header className="ct-panel-head"><h3 id="ct-log-title">逐项验证记录</h3>
        <div className="ct-actions"><button type="button" className="ct-button" onClick={() => onAction('contract-test-consumer')}>只验证调用代码</button>
          <button type="button" className="ct-button" onClick={() => onAction('contract-test-provider')}>只验证库存响应</button></div></header>
      {checks.length ? <dl>{checks.map(([label, check]) => <div key={label}><dt>{label} <Verdict check={check} /></dt>
        <dd>{check.note}{check.issues?.length > 1 && <ul>{check.issues.slice(1).map(issue => <li key={issue}>{issue}</li>)}</ul>}</dd></div>)}</dl>
        : <p>运行验证后，这里会显示每项检查的结果和原因。</p>}
    </section>
  </div>;
}

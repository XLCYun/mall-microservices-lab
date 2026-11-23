import React from 'react';
import { phonePath } from './phone-endpoint.js';
import { phoneTransport } from './phone-client.js';
import { StoryCard } from './walkthrough.jsx';
import { Board, Table } from './lesson-controls.jsx';

const lab = () => window.Lab.scenes.phone;
const number = id => String(id).padStart(2, '0');
const stateOf = row => row.error ? 'error' : row.actual === null ? 'pending' : row.actual === row.expected ? 'pass' : 'fail';

const introduction = {
  id: 'intro', label: '用例与断言', title: '什么是数据驱动测试？',
  lead: '把输入和预期结果写进用例表。同一段测试代码逐行读取数据，执行相同的步骤，再比较实际结果和预期结果。',
  body: <>少一位的手机号预期无效。接口返回 <code>false</code>，符合预期，这条用例就通过。要再测带空格的号码，只需在表里加一行。</>
};

function DataDrivenIntro() {
  const examples = lab().initialCases.slice(0, 2).map(({ name, phone, expected }) => [
    name, <code>{phone}</code>, <><code>{String(expected)}</code>（{expected ? '有效' : '无效'}）</>
  ]);
  return <StoryCard sceneId="phone" chapter={1} slide={introduction}>
    <Board tone="mint" title="手机号用例表示例">
      <Table label="两组手机号输入和预期结果" columns={['用例', '输入 phone', '预期 expected']} rows={examples} />
      <div className="lesson-calculation"><span>每行使用同一个断言</span><code>valid === expected</code></div>
    </Board>
  </StoryCard>;
}

function Verdict({ row, sending = false }) {
  const state = sending ? 'pending' : stateOf(row);
  return <span className="phone-verdict" data-state={state}>
    <i aria-hidden="true">{{ pass: '✓', fail: '×', error: '!', pending: '·' }[state]}</i>
    {sending ? '发送中' : lab().verdict(row)}
  </span>;
}

function CaseRow({ row, state, act }) {
  const selected = state.selectedId === row.id;
  const select = () => { if (!selected) act('phone-select', row.id); };
  const label = '用例 ' + number(row.id);
  const rawProps = {
    value: row.phone, disabled: state.busy, 'aria-label': label + '手机号',
    spellCheck: false, autoComplete: 'off', placeholder: '空字符串', className: 'phone-cell-input phone-raw',
    onChange: event => act('phone-raw-' + row.id, event.target.value)
  };
  return <tr data-selected={selected} onFocus={select} onClick={select}>
    <td className="phone-number-cell"><button type="button" className="phone-number" aria-label={'查看' + label}
      aria-pressed={selected} aria-controls="phone-exchange" onClick={select}>{number(row.id)}</button></td>
    <td className="phone-name-cell"><input className="phone-cell-input" value={row.name} disabled={state.busy}
      aria-label={label + '名称'} placeholder="用例名称" onChange={event => act('phone-name-' + row.id, event.target.value)} /></td>
    <td className="phone-input-cell">{/[\r\n]/.test(row.phone) ? <textarea {...rawProps} rows={2} /> : <input {...rawProps} />}
      {/[\s]/.test(row.phone) && <small className="phone-spaces">{Array.from(row.phone).length} 个字符，含空白</small>}</td>
    <td className="phone-expect-cell"><select aria-label={label + '预期'} disabled={state.busy}
      value={row.expected ? 'valid' : 'invalid'} onChange={event => act('phone-expected-' + row.id, event.target.value)}>
      <option value="valid">有效</option><option value="invalid">无效</option>
    </select></td>
    <td className="phone-result-cell"><Verdict row={row} sending={state.sendingId === row.id} /></td>
  </tr>;
}

function CaseTable({ state, act }) {
  const { finished, passed, failed, errors } = lab().counts(state);
  return <section className="phone-panel phone-suite" aria-labelledby="phone-suite-title">
    <header className="phone-panel-head"><div><h3 id="phone-suite-title">测试用例</h3>
      <p className="phone-progress" aria-live="polite">{finished} / {state.rows.length} 已运行
        {finished > 0 && <span> · {passed} 通过</span>}{failed > 0 && <span> · {failed} 不符</span>}
        {errors > 0 && <span> · {errors} 出错</span>}</p></div>
      <button type="button" className="phone-button primary" disabled={state.busy || !state.rows.length}
        onClick={() => act('phone-all')}><span aria-hidden="true">▶</span> 运行全部</button>
    </header>
    <table className="phone-table"><caption className="visually-hidden">选择用例编号可查看对应请求。名称、手机号和预期可以编辑。</caption>
      <thead><tr><th scope="col">编号</th><th scope="col">用例名称</th><th scope="col">手机号</th>
        <th scope="col">预期</th><th scope="col">断言</th></tr></thead>
      <tbody>{state.rows.map(row => <CaseRow key={row.id} row={row} state={state} act={act} />)}
        {!state.rows.length && <tr><td colSpan="5" className="phone-empty">测试表为空，可以新增用例或导入 CSV。</td></tr>}</tbody>
    </table>
    <div className="phone-table-tools">
      <button type="button" className="phone-button" disabled={state.busy} onClick={() => act('phone-add')}>＋ 新增用例</button>
      <label className="phone-button phone-file">导入 CSV<input type="file" accept=".csv,text/csv,text/plain" disabled={state.busy}
        aria-label="导入 CSV 用例" onChange={event => act('phone-import', '', event.currentTarget)} /></label>
      <button type="button" className="phone-button" onClick={() => act('phone-export')}>导出 CSV</button>
    </div>
    <details className="phone-extras"><summary>更多用例操作</summary>
      <div className="phone-extra-actions"><label>边界用例 <select value={state.preset} disabled={state.busy}
        onChange={event => act('phone-preset', event.target.value)}>
        {lab().samples.map(sample => <option key={sample.key} value={sample.key}>{sample.name}</option>)}
      </select></label>
      <button type="button" className="phone-button" disabled={state.busy} onClick={() => act('phone-add-preset')}>加入表格</button>
      <button type="button" className="phone-text-button" disabled={state.busy || state.selectedId === null}
        onClick={() => act('phone-remove', state.selectedId)}>删除所选用例</button></div>
      <p>CSV 表头包含“输入原文”和“预期校验结果”，预期填“有效”或“无效”。导入的用例会追加到表尾。</p>
    </details>
    {state.importNote && <p role="status" className="phone-import-note" data-error={state.importError}>{state.importNote}</p>}
  </section>;
}

function JsonBody({ text }) {
  let formatted;
  try {
    formatted = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return <pre><code>{text}</code></pre>;
  }
  const parts = formatted.split(/("(?:\\.|[^"\\])*":|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b)/g);
  return <pre><code>{parts.map((part, index) => index % 2 ?
    <span key={index} className={part.endsWith(':') ? 'phone-json-key' : 'phone-json-value'}>{part}</span> : part)}</code></pre>;
}

function Exchange({ row, state, act }) {
  if (!row) return <section id="phone-exchange" className="phone-panel phone-empty">选择一条用例即可查看请求和响应。</section>;
  const sending = state.sendingId === row.id;
  const receipt = row.exchange;
  const status = receipt?.status;
  const hasResponse = status != null;
  const transport = phoneTransport();
  return <section id="phone-exchange" className="phone-panel phone-exchange" aria-labelledby="phone-exchange-title">
    <header className="phone-panel-head"><div><p className="phone-case-ref">用例 {number(row.id)}</p>
      <h3 id="phone-exchange-title">{row.name || '未命名用例'}</h3></div>
      <button type="button" className="phone-button outlined" disabled={state.busy}
        onClick={() => act('phone-run', row.id)}>{sending ? '正在发送…' : '发送此用例'}</button></header>
    <div className="phone-trace-body">
      <section className="phone-wire request"><div className="phone-wire-head"><h4>请求体</h4>
        <span>{receipt ? 'application/json' : 'JSON 预览'}</span></div>
        <JsonBody text={receipt?.body ?? lab().requestBody(row)} />
      </section>
      <section className="phone-wire response" data-ready={hasResponse} data-error={Boolean(row.error)}>
        <div className="phone-wire-head"><h4>接口响应</h4>
          <span>{hasResponse ? 'HTTP ' + status : sending ? '等待响应' : row.error ? '请求出错' : '尚未运行'}</span></div>
        {receipt?.text && <JsonBody text={receipt.text} />}
        {(row.error || !hasResponse) && <p className="phone-response-note">
          {row.error || (sending ? '请求已发起，正在等待接口返回。' : '点击“发送此用例”，查看接口返回的 JSON。')}
        </p>}
      </section>
      <div className="phone-assert" data-state={stateOf(row)}><span>预期 <b>{String(row.expected)}</b></span>
        <span>实际 <b>{row.actual === null ? '—' : String(row.actual)}</b></span><Verdict row={row} sending={sending} /></div>
    </div><footer className="phone-trace-footer">{transport} · 比较响应字段 <code>valid</code> 与用例预期</footer>
  </section>;
}

function SourceExample({ rows }) {
  const records = rows.map(lab().caseData);
  const lines = records.map(({ phone, expected }) =>
    '  { "phone": ' + JSON.stringify(phone) + ', "expected": ' + expected + ' }');
  const dataset = lines.length ? '[\n' + lines.join(',\n') + '\n]' : '[]';
  const online = location.protocol !== 'file:';
  const sender = online ? 'const response = await fetch(url, options);' : 'const response = await verifyPhone(new Request(url, options));';
  const driver = [
    'const cases = rows.map(({ phone, expected }) =>',
    '  ({ phone, expected }));',
    'const url = "./' + phonePath + '";',
    'for (const { phone, expected } of cases) {',
    '  const options = {',
    '    method: "POST",',
    '    headers: { "Content-Type": "application/json" },',
    '    body: JSON.stringify({ phone })',
    '  };',
    '  ' + sender,
    '  const { valid } = await response.json();',
    '  console.assert(response.ok && valid === expected);',
    '}'
  ].join('\n');
  return <details className="phone-panel phone-source" open><summary>
    <span>表格如何变成请求</span><span className="phone-source-lang">JSON / JavaScript</span>
  </summary>
    <div className="phone-code-grid"><section><h4>用例表生成的 JSON</h4>
      <p>每行保留 <code>phone</code> 和 <code>expected</code>，组成用例数组 <code>cases</code>。</p>
      <pre><code>{dataset}</code></pre></section>
      <section><h4>逐行发送与断言</h4><p>请求体只包含手机号。测试代码用预期值核对响应。</p>
        <pre><code>{driver}</code></pre></section></div>
  </details>;
}

export function PhoneOverview() {
  return <>
    <DataDrivenIntro />
    <header className="phone-intro"><div><h2>手机号格式校验</h2>
      <p>在下方用例表选一行，点击“发送此用例”查看请求和响应，也可以点击“运行全部”逐行验证。</p></div>
      <div className="phone-endpoint"><b>POST</b><code>/{phonePath}</code></div>
    </header>
  </>;
}

export function PhoneWorkspace({ state, onAction }) {
  const row = state.rows.find(item => item.id === state.selectedId);
  return <>
    <p className="phone-rule"><strong>校验规则</strong>输入 11 位半角数字，首位是 1，第二位是 3–9。空格按原样参与校验。</p>
    <div className="phone-columns"><CaseTable state={state} act={onAction} /><Exchange row={row} state={state} act={onAction} /></div>
    <SourceExample rows={state.rows} />
  </>;
}

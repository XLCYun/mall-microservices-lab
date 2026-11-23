import React, { useMemo } from 'react';
import { ChoiceButtons } from './lesson-controls.jsx';
import { ControlIcon, StoryCard } from './walkthrough.jsx';

const lab = () => window.Lab.scenes.contract;
const steps = [
  ['运行订单测试', 'ct-order-test', '查看订单测试'],
  ['生成契约', 'ct-order-contract', '查看契约文件'],
  ['发布契约', 'ct-broker', '查看交接记录'],
  ['取回契约', 'ct-broker', '查看交接记录'],
  ['验证库存', 'ct-baseline', '查看库存响应'],
  ['回传结果', 'ct-broker', '查看验证记录'],
  ['验证变更', 'ct-version-comparison', '查看变更结果']
];
const intro = {
  id: 'intro', label: '订单服务的测试', title: '订单测试通过了，为什么还需要契约测试？',
  lead: <>测试下单逻辑时，订单团队把库存地址指向模拟服务（Mock）。订单客户端向它发出查询，再从响应的 <code>stock</code> 字段读取库存数量。</>,
  body: <>如果真实库存把 <code>stock</code> 改名为 <code>quantity</code>，模拟库存仍会返回旧字段。订单测试照样通过，真正下单时却读不到库存。用同一份契约验证真实接口，就能在发布前发现这次改动。</>
};
const verification = {
  id: 'verification', label: '库存服务的验证', title: '库存接口符合契约吗？',
  lead: '订单服务调用库存接口，是消费者。库存服务提供接口，是提供者。契约写明订单会发什么请求，以及库存的响应要满足哪些条件。',
  bullets: [
    ['消费者驱动', '本例由订单团队在测试中写明需要哪些字段，库存团队用生成的契约验证接口。'],
    ['提供者驱动', '库存团队先公布接口契约，再验证自己的实现。订单团队按这份契约编写和测试调用代码。']
  ],
  body: <>两边的持续集成（CI）流水线通过 Pact Broker 交接。Broker 保存契约和验证结果。发布新契约时，Broker 还可以通过 Webhook 通知库存 CI 开始验证。
    <span className="ct-sources">
      <a href="https://docs.pact.io/getting_started/how_pact_works" target="_blank" rel="noreferrer">Pact 官方流程</a>
      <a href="https://docs.pact.io/pact_broker/overview" target="_blank" rel="noreferrer">Broker 工作方式</a>
    </span></>
};

const actorNames = { order: '订单服务', mock: '模拟库存服务', verifier: '契约验证器', inventory: '真实库存服务' };

function FieldText({ text }) {
  return String(text).split(/\b(stock|quantity|available)\b/).map((part, index) =>
    ['stock', 'quantity', 'available'].includes(part)
      ? <mark className={'ct-field ct-field-' + part} key={index}>{part}</mark> : part);
}

function Actor({ kind }) {
  return <div className="ct-actor">
    <span className="ct-actor-art" data-actor={kind} aria-hidden="true" />
    <strong>{actorNames[kind]}</strong>
  </div>;
}

function InventoryExchange({ from, to, call }) {
  const { request, actual } = call;
  const reply = to === 'mock' ? actual.body : { stock: actual.body.stock };
  return <div className="ct-exchange" role="group" aria-label={actorNames[from] + '调用' + actorNames[to]}>
    <Actor kind={from} />
    <div className="ct-messages">
      <div className="ct-message">
        <span>请求 <code>{request.method} {request.path}</code></span>
        <code>{JSON.stringify(request.body)}</code>
        <i className="ct-wire" aria-hidden="true" />
      </div>
      <div className="ct-message ct-reply">
        <span>{to === 'mock' ? '模拟响应' : '实际响应节选'} <code>HTTP {actual.status}</code></span>
        <code>{JSON.stringify(reply)}</code>
        <i className="ct-wire" aria-hidden="true" />
      </div>
    </div>
    <Actor kind={to} />
  </div>;
}

function PactFile({ pact }) {
  const { request, response } = pact.interactions[0];
  return <div className="ct-pact-file">
    <strong className="ct-pact-name"><span aria-hidden="true">{'{ }'}</span><code>{lab().pactFilename}</code></strong>
    <dl className="ct-pact-parties">
      <div><dt>消费者</dt><dd>{pact.consumer.name}</dd></div>
      <div><dt>提供者</dt><dd>{pact.provider.name}</dd></div>
    </dl>
    <dl className="ct-pact-terms">
      <div><dt>请求</dt><dd><code>{request.method} {request.path}</code> <code>{JSON.stringify(request.body)}</code></dd></div>
      <div><dt>预期响应</dt><dd><code>HTTP {response.status}</code>，包含整数字段 <code>stock</code>，示例值为 <code>{response.body.stock}</code>。</dd></div>
    </dl>
  </div>;
}

function BrokerTransfer({ pipeline, orderVersion, receives = false, children }) {
  const direction = receives ? 'Pact Broker → ' + pipeline : pipeline + ' → Pact Broker';
  return <div className="ct-broker-transfer" role="group" aria-label={direction}>
    <div className="ct-pipeline-node">
      <strong>{pipeline}</strong>
      {orderVersion && <small>订单版本 <code>{orderVersion}</code></small>}
    </div>
    <div className="ct-payload" data-direction={receives ? 'left' : 'right'}>
      <span>{children}</span>
      <i className="ct-wire" aria-hidden="true" />
    </div>
    <div className="ct-broker-node">
      <img src="./art/pact-broker.webp" width="256" height="206" alt="" />
      <strong>Pact Broker</strong>
    </div>
  </div>;
}

function ConsumerDiagram({ example }) {
  return <ol className="ct-process" aria-label="订单测试、生成契约和发布契约">
    <li>
      <h3>在订单测试里模拟库存服务</h3>
      <InventoryExchange from="order" to="mock" call={example.order} />
    </li>
    <li>
      <h3>测试通过后，Pact 自动生成契约</h3>
      <PactFile pact={example.pact} />
    </li>
    <li>
      <h3>订单 CI 把契约存入 Pact Broker</h3>
      <BrokerTransfer pipeline="订单 CI" orderVersion={lab().consumerBuilds.order}>
        <code>{lab().pactFilename}</code>
      </BrokerTransfer>
    </li>
  </ol>;
}

function ProviderDiagram({ example }) {
  const { original, renamed } = example;
  return <ol className="ct-process ct-provider-process" start={4} aria-label="取回契约、验证库存和回传结果">
    <li>
      <h3>库存 CI 从 Broker 取回同一份契约</h3>
      <BrokerTransfer pipeline="库存 CI" orderVersion={lab().consumerBuilds.order} receives>
        <code>{lab().pactFilename}</code>
      </BrokerTransfer>
    </li>
    <li>
      <h3>验证器重放契约中的请求，核对实际响应</h3>
      <InventoryExchange from="verifier" to="inventory" call={original} />
    </li>
    <li>
      <h3>库存 CI 把验证结果回传给 Broker</h3>
      <BrokerTransfer pipeline="库存 CI">库存版本和验证结果</BrokerTransfer>
      <div className="ct-example-results">
        <span><code>{lab().inventoryBuilds.original}</code> 保留 <code>stock</code> <Verdict passed={original.passed} /></span>
        <span><code>{lab().inventoryBuilds.rename}</code> 改为 <code>quantity</code> <Verdict passed={renamed.passed} /></span>
      </div>
    </li>
  </ol>;
}

function Workflow({ state, act, onShell, playing }) {
  const { phase, versions, consumerBuilds, inventoryBuilds } = lab();
  const next = phase(state);
  const { orderTest, comparison } = state;
  const complete = next > steps.length;
  const [, evidenceId, evidenceLabel] = steps[Math.max(0, next - 2)];
  function showEvidence() {
    const panel = document.getElementById(evidenceId);
    panel?.focus({ preventScroll: true });
    panel?.scrollIntoView({ block: 'start' });
  }
  const messages = [
    orderTest?.issue || '订单 CI 将运行下单测试，向模拟库存查询 ' + state.sku + '。',
    '订单客户端读到 stock = ' + orderTest?.value + '，Pact 接着从这次通过的测试生成契约。',
    '订单契约已生成。订单 CI 将契约连同订单版本 ' + consumerBuilds.order + ' 发布到 Pact Broker。',
    'Broker 已收到订单契约。库存 CI 接下来取回该版本的契约。',
    '库存 CI 已取回契约。验证器将重放请求，检查库存原始版本 ' + inventoryBuilds.original + ' 的实际响应。',
    '原始库存的验证' + (state.baseline?.passed ? '通过' : '失败') + '。库存 CI 将把结果和库存版本回传给 Broker。',
    'Broker 已收到原始版本的结果。接下来让库存把 stock 改名为 quantity，再验证订单和商品各自的契约。'
  ];
  const message = complete
    ? inventoryBuilds[comparison.version] + '（' + versions[comparison.version] + '）返回 HTTP ' + comparison.order.actual.status +
      '。Broker 已收到两份结果。订单' + (comparison.order.passed ? '通过' : '失败') + '，商品' + (comparison.product.passed ? '通过。' : '失败。')
    : messages[next - 1];
  return <section className="ct-workflow" aria-label="契约实验流程">
    <ol className="ct-steps" aria-label="实验顺序">{steps.map(([name], i) => {
      const number = i + 1;
      const done = number < next;
      return <li key={name} data-step={done ? 'done' : number === next ? 'current' : 'later'}
        aria-current={number === next ? 'step' : undefined}>
        <span className="ct-step-index" aria-hidden="true">{done ? '✓' : number}</span>
        <span>{name}</span><span className="visually-hidden">{done ? '，已完成' : number === next ? '，当前步骤' : '，待执行'}</span>
      </li>;
    })}</ol>
    <div className="ct-next-action">
      <p role="status"><FieldText text={message} /></p>
      <div className="ct-action-links"><button className="ct-text-button" type="button" aria-controls={evidenceId} onClick={showEvidence}>{evidenceLabel}</button>
        {!complete && <button className="ct-button" type="button" disabled={playing} onClick={() => onShell('step')}><ControlIcon name="step" />单步推进</button>}
        {complete
          ? <button className="ct-button primary" type="button" onClick={() => act('contract-compare', comparison.version)}><ControlIcon name="reset" />重放当前版本</button>
          : <button className="ct-button primary" type="button" onClick={() => onShell('play')}><ControlIcon name={playing ? 'pause' : 'play'} />{playing ? '暂停流程' : next === 1 ? '运行 CI 流程' : '继续 CI 流程'}</button>}
      </div>
    </div>
  </section>;
}

export function ContractOverview({ state, onAction, onShell, playing }) {
  const example = useMemo(() => lab().exampleFor(state.sku), [state.sku]);
  return <>
    <div className="ct-story-cards">
      <StoryCard sceneId="contract" chapter={1} slide={intro}><ConsumerDiagram example={example} /></StoryCard>
      <StoryCard sceneId="contract" chapter={2} slide={verification}><ProviderDiagram example={example} /></StoryCard>
    </div>
    <header className="ct-experiment-heading">
      <h2>从订单测试到库存验证</h2>
      <p>运行两条模拟 CI 流水线，跟随订单契约经过 Pact Broker，再比较库存字段改名前后的验证结果。也可以逐步运行，查看每一步的请求、文件和记录。</p>
    </header>
    <Workflow state={state} act={onAction} onShell={onShell} playing={playing} />
  </>;
}

function PanelHeading({ number, title, children }) {
  return <header className="ct-panel-head"><h3>{number && <span>{number}</span>}{title}</h3>{children}</header>;
}

function Verdict({ passed }) {
  return <span className="ct-verdict" data-passed={passed}><i aria-hidden="true">{passed ? '✓' : '×'}</i>{passed ? '通过' : '失败'}</span>;
}

function BrokerRecord({ state }) {
  const { broker, fetched, baseline, comparison } = state;
  const { versions, roles, inventoryBuilds, pactFilename } = lab();
  const published = broker.publications.order;
  const receipts = Object.entries(broker.results);
  const latestVersion = comparison?.version || 'original';
  return <section id="ct-broker" tabIndex={-1} className="ct-panel" aria-label="Pact Broker 的交接记录">
    <PanelHeading title="Pact Broker 的交接记录"><span>浏览器内模拟</span></PanelHeading>
    <ol className="ct-transfers">
      <li data-recorded={Boolean(published)}><strong>订单 CI 发布契约</strong>
        <span>{published ? <><code>{published.consumerVersion}</code> 已发布 <code>{pactFilename}</code></>
          : state.pact ? '文件已生成，等待订单 CI 发布' : '等待订单测试生成契约'}</span></li>
      <li data-recorded={Boolean(fetched)}><strong>库存 CI 取回契约</strong>
        <span>{fetched ? <>已从 Broker 取回 <code>{fetched.order.consumerVersion}</code> 的契约</> : '等待从 Broker 取回订单契约'}</span></li>
      <li data-recorded={receipts.length > 0}><strong>库存 CI 回传结果</strong>
        <span>{receipts.length ? <>Broker 已收到 <code>{inventoryBuilds[latestVersion]}</code> 的结果</> : baseline ? '库存验证已完成，等待回传' : '等待库存验证完成'}</span></li>
    </ol>
    <table className="ct-results-table ct-broker-table">
      <caption>Broker 保存的版本验证结果</caption>
      <thead><tr><th scope="col">消费者版本</th><th scope="col">库存版本</th><th scope="col">验证结果</th><th scope="col">响应与契约的比较</th></tr></thead>
      <tbody>{receipts.length ? receipts.flatMap(([version, results]) => results.map(row =>
        <tr key={version + '-' + row.person}>
          <td>{roles[row.person].name} <code>{row.consumerVersion}</code></td>
          <td>{versions[version]} <code>{row.providerVersion}</code></td>
          <td><Verdict passed={row.passed} /></td>
          <td>{row.passed ? <>HTTP 状态码和 <code>{roles[row.person].field}</code> 均符合契约</> : <FieldText text={row.issues.join(' ')} />}</td>
        </tr>)) : <tr><td colSpan={4}>库存 CI 回传后，这里会列出哪些消费者版本与库存版本可以配合使用。</td></tr>}</tbody>
    </table>
  </section>;
}

function ConsumerTest({ state, act }) {
  const { orderTest, sku } = state;
  const expected = orderTest?.interaction || lab().interactionFor('order', sku);
  const units = expected.response.body.stock.example;
  const sampleCode = [
    'pact.given("' + expected.given + '")',
    'pact.uponReceiving("' + expected.description + '")',
    'pact.withRequest({',
    '  method: "' + expected.request.method + '", path: "' + expected.request.path + '",',
    '  headers: { "Content-Type": "application/json" },',
    '  body: ' + JSON.stringify(expected.request.body),
    '})',
    'pact.willRespondWith({',
    '  status: ' + expected.response.status + ',',
    '  headers: { "Content-Type": "application/json" },',
    '  body: { stock: MatchersV3.integer(' + units + ') }',
    '})',
    'await pact.executeTest(async mock => {',
    '  const orders = new OrderClient(mock.url)',
    '  const stock = await orders.getStock("' + sku + '")',
    '  expect(stock).toBe(' + units + ')',
    '})'
  ].join('\n');
  return <section id="ct-order-test" tabIndex={-1} className="ct-panel ct-consumer" aria-label="订单服务的消费者测试">
    <PanelHeading number="01" title="订单 CI 运行消费者测试">
      {orderTest ? <Verdict passed={orderTest.passed} /> : <span>待运行</span>}
    </PanelHeading>
    <div className="ct-panel-body">
      <label className="ct-sample">测试商品<select aria-label="测试商品" value={sku} disabled={Boolean(orderTest)}
        onChange={event => act('contract-sku', event.target.value)}>
        {Object.entries(lab().cases).map(([id, n]) => <option key={id} value={id}>{id} · {n} 件</option>)}
      </select></label>
      <dl className="ct-facts">
        <div><dt>发给模拟库存</dt><dd><code>{expected.request.method} {expected.request.path}</code></dd></div>
        <div><dt>请求体</dt><dd><code>{JSON.stringify(expected.request.body)}</code></dd></div>
      </dl>
      <p className="ct-code-title">订单测试节选 <span>Pact JS · V3</span></p>
      <pre className="ct-json ct-test-code"><code><FieldText text={sampleCode} /></code></pre>
      {orderTest ? <p className="ct-receipt" data-passed={orderTest.passed}>
        {orderTest.passed ? <><span className="ct-receipt-wire">模拟库存响应 <code>HTTP {orderTest.actual.status} · <FieldText text={JSON.stringify(orderTest.actual.body)} /></code></span>
          订单客户端读到 <code><FieldText text={'stock = ' + orderTest.value} /></code>，
          {orderTest.value > 0 ? '允许下单。' : '提示库存不足。'}</> : orderTest.issue}
      </p> : <button className="ct-button ct-test-action" type="button" onClick={() => act('contract-order-test')}>单步运行订单测试</button>}
    </div>
  </section>;
}

function OrderContract({ state, act }) {
  const pending = state.orderTest?.passed ? '测试已通过，等待生成契约' : '等待订单测试';
  return <section id="ct-order-contract" tabIndex={-1} className="ct-panel ct-artifact" aria-label="自动生成的订单契约">
    <PanelHeading number="02–03" title="订单测试生成的契约"><span>{state.broker.publications.order ? '已发布到 Pact Broker' : state.pact ? '已生成，等待发布' : pending}</span></PanelHeading>
    <div className="ct-file-bar"><code>{lab().pactFilename}</code>
      {state.pact && <button type="button" className="ct-text-button" onClick={() => act('contract-download')}>
        <ControlIcon name="download" />下载 JSON</button>}
    </div>
    {state.pact ? <div className="ct-artifact-content">
      <p className="ct-file-rule">测试中的 <code><FieldText text="stock" /></code> 写入响应示例，<code>integer</code> 写入匹配规则。订单 CI 发布的就是这份文件。</p>
      <pre className="ct-json" aria-label="完整订单契约 JSON"><code><FieldText text={state.pact} /></code></pre>
    </div> : <div className="ct-file-empty"><b aria-hidden="true">{'{ }'}</b>
      <p>生成的文件会完整显示本次请求、示例响应和字段匹配规则。</p></div>}
  </section>;
}

function OriginalVerification({ state, act }) {
  const check = state.baseline;
  return <section id="ct-baseline" tabIndex={-1} className="ct-panel ct-original" aria-label="用订单契约验证库存原始实现">
    <PanelHeading number="05" title="库存 CI 验证原始实现">
      {check ? <Verdict passed={check.passed} /> : <span>{state.fetched ? '契约已取回，可以重放' : '等待从 Broker 取回契约'}</span>}
    </PanelHeading>
    <div className="ct-panel-body">
      {check ? <>
        <div className="ct-wire-heading"><code>{check.request.method} {check.request.path}</code><strong>HTTP {check.actual.status}</strong></div>
        <p className="ct-wire-caption">库存服务实际返回</p>
        <pre className="ct-json ct-response-json"><code><FieldText text={JSON.stringify(check.actual.body, null, 2)} /></code></pre>
        <p className="ct-receipt" data-passed={check.passed}>{check.passed
          ? <>响应包含整数 <code><FieldText text={'stock = ' + check.actual.body.stock} /></code>，符合订单契约。</>
          : check.issues.join(' ')}</p>
      </> : <>
        <p>库存 CI 从 Broker 取回订单契约后，验证器向当前构建的库存服务发送文件中的请求，再核对实际响应。</p>
        <button className="ct-button" type="button" disabled={!state.fetched} onClick={() => act('contract-verify-original')}>重放订单契约</button>
      </>}
    </div>
  </section>;
}

function VersionComparison({ state, act }) {
  const { comparison } = state;
  const originalReported = Boolean(state.broker.results.original);
  const { roles, people, versions } = lab();
  const options = Object.entries(versions).filter(([id]) => id !== 'original');
  return <section id="ct-version-comparison" tabIndex={-1} className="ct-panel ct-comparison" aria-label="比较接口变更对消费者的影响">
    <PanelHeading number="07" title="验证变更后的库存接口"><span>{comparison ? versions[comparison.version] : originalReported ? '可以验证字段改名' : '等待原始版本的结果回传'}</span></PanelHeading>
    <div className="ct-panel-body">
      {comparison ? <>
        <ChoiceButtons label="验证其他实现" value={comparison.version} options={options}
          onChange={value => act('contract-compare', value)} />
        <p>库存 CI 从 Broker 取回两份契约。订单要求 <code><FieldText text="stock" /></code> 是整数，商品团队先前发布的契约要求 <code><FieldText text="available" /></code> 是布尔值。两个结果分别回传。</p>
        <div className="ct-compare-grid"><table className="ct-results-table">
          <caption className="visually-hidden">同一库存版本对两份消费者契约的验证结果</caption>
          <thead><tr><th>消费者</th><th>契约要求</th><th>实际结果</th></tr></thead>
          <tbody>{people.map(id => {
            const role = roles[id], check = comparison[id];
            return <tr key={id}><th scope="row">{role.name}</th><td>HTTP 200<br /><code><FieldText text={role.field} /></code> · {role.type}</td>
              <td><Verdict passed={check.passed} /><small>{check.passed
                ? role.field + ' = ' + JSON.stringify(check.actual.body[role.field]) : check.issues.join(' ')}</small></td>
            </tr>;
          })}</tbody>
        </table>
        <div className="ct-changed-wire"><div className="ct-wire-heading"><b>{versions[comparison.version]}后的响应</b><strong>HTTP {comparison.order.actual.status}</strong></div>
          <pre className="ct-json ct-response-json"><code><FieldText text={JSON.stringify(comparison.order.actual.body, null, 2)} /></code></pre>
        </div></div>
      </> : <>
        <p>把库存响应中的 <code><FieldText text="stock" /></code> 改为 <code><FieldText text="quantity" /></code>，用同一份订单契约再次验证。</p>
        <button className="ct-button" type="button" disabled={!originalReported} onClick={() => act('contract-compare', 'rename')}>验证字段改名</button>
      </>}
    </div>
  </section>;
}

export function ContractWorkspace({ state, onAction }) {
  return <div className="ct-workbench">
    <BrokerRecord state={state} />
    <div className="ct-evidence-grid">
      <ConsumerTest state={state} act={onAction} />
      <OrderContract state={state} act={onAction} />
      <OriginalVerification state={state} act={onAction} />
    </div>
    <VersionComparison state={state} act={onAction} />
  </div>;
}

import React from 'react';
import {Board, Choice, ChoiceButtons, Readout, Settings, Table, Toggle, amounts} from './lesson-controls.jsx';

function Preview({frame}) {
  const {last} = frame.state;
  return <Board tone="ink" title="网关收到的商品查询" note={last.tagged ? '内测请求' : '普通请求'}>
    <div className="mesh-http"><b>GET</b><code>/products/42</code></div>
    <div className="mesh-request-header"><span>请求头</span>
      {last.tagged ? <code>x-canary: true</code> : <span>未带内测标记</span>}</div>
    <div className="lesson-result"><span>{last.matched ? '命中内测规则' : '按普通流量权重分配'}</span>
      <strong>商品 {last.destination}</strong></div>
  </Board>;
}

function Weights({frame}) {
  const {state, model} = frame;
  const requests = model.batch.requests.filter(r => r.kind === 'entry');
  return <Board tone="mint" title="这一秒的分流结果" note={requests.length + ' 笔普通请求'}>
    <div className="lesson-split">
      <div><span>旧版 v1</span><strong>{state.frame.v1}<small> 笔</small></strong></div>
      <div><span>新版 v2</span><strong>{state.frame.v2}<small> 笔</small></strong></div>
    </div>
    <div className="lesson-arrivals mesh-arrivals"><span>按到达顺序</span>
      <ol>{requests.map((r, i) => <li key={r.index} data-version={r.destination}
        aria-label={'第 ' + (i + 1) + ' 笔到达 ' + r.destination}>{i + 1}</li>)}</ol></div>
  </Board>;
}

function Executor({frame}) {
  const {state, model} = frame;
  const packet = model.batch.requests[model.batch.requests.length - 1];
  const names = new Map(model.nodes.map(n => [n.id,n.label]));
  const usesSidecar = state.architecture === 'sidecar';
  const ruleTarget = names.get(usesSidecar ? 'sidecar' : 'gateway');
  return <Board title="规则和请求各走哪条路？" note={usesSidecar ? 'Istio · Sidecar 模式' : '商城网关分流'}>
    <div className="mesh-path"><span>规则下发</span>
      <p>{names.get('control')} <i>→</i> {ruleTarget}</p></div>
    <div className="mesh-path"><span>最近一笔商品请求</span>
      <p>{packet.path.map((node, i) => <React.Fragment key={node}>
        {i > 0 && <i> → </i>}{names.get(node)}</React.Fragment>)}</p></div>
    <div className="mesh-path"><span>如果订单服务直接查商品</span>
      <p>{usesSidecar ? '订单服务接入网格后，它的出站代理也能用这条规则选择商品版本。'
        : '这笔调用绕过商城入口。要给它做灰度，需要在订单到商品的调用路径上另配分流。'}</p></div>
  </Board>;
}

function Rollback({frame}) {
  const s = frame.state;
  const rows = [['控制平面已发布',s.desired],['代理已生效',s.applied]].map(([name,rule]) =>
    [name,'#' + rule.version,(100 - rule.v2) + '%',rule.v2 + '%']);
  return <Board tone="amber" title="已发布规则与生效规则" note={'T+' + s.time + ' 秒'}>
    <Table label="对照路由规则" columns={['规则状态','规则版本','v1 权重','v2 权重']} rows={rows} />
    <div className="lesson-result"><span>下发状态</span><strong>
      {s.due === null ? '代理已应用 #' + s.applied.version : s.hold ? '已暂停，代理沿用 #' + s.applied.version : '下一秒下发 #' + s.desired.version}
    </strong></div>
  </Board>;
}

function MeshReadout({record, frame}) {
  const s = frame.state, counts = s.frame;
  const received = [['v1 接单',counts.v1,'笔'],['v2 接单',counts.v2,'笔']];
  if (record.id === 'preview') return <Readout title="路由匹配顺序" columns={['先后','匹配条件','转发目标']}
    rows={[['1','带内测标记','商品 v2'],['2','其余请求','商品 v1']]} stats={received} />;
  if (record.id === 'executor') return <Readout title="路由配置" columns={['配置项','当前值']}
    rows={[['规则执行者',s.architecture === 'sidecar' ? 'Envoy 出站代理' : '商城网关（内置 SDK）'],['使用的规则','#' + s.applied.version],
      ['新版权重',s.applied.v2 + '%']]} stats={received} />;
  return <Readout title={record.id === 'rollback' ? '新请求的去向' : '普通请求分配'} columns={['商品版本','生效权重','本秒接单']}
    rows={[['旧版 v1',(100 - s.applied.v2) + '%',counts.v1 + ' 笔'],['新版 v2',s.applied.v2 + '%',counts.v2 + ' 笔']]}
    stats={[['总请求',counts.requests,'笔'],['v2 占比',counts.requests ? Math.round(100 * counts.v2 / counts.requests) : '—','%']]} />;
}

function MeshSettings({record, frame, change, playback, index}) {
  const s = frame.state;
  if (record.id === 'preview') {
    function send(tagged) {
      change('taggedShare', tagged ? 100 : 0);
      playback.replaySecond(index);
    }
    return <Settings><button type="button" onClick={() => send(false)}>发送普通请求</button>
      <button type="button" onClick={() => send(true)}>发送内测请求</button></Settings>;
  }
  if (record.id === 'weights') return <Settings><Choice label="v2 普通流量权重" value={s.desired.v2}
    options={amounts([0,5,10,25,50,100],'%')} onChange={v => change('weightV2',v)} /></Settings>;
  if (record.id === 'executor') return <Settings><ChoiceButtons label="分流方式" value={s.architecture}
    options={[['sdk','商城网关分流'],['sidecar','Istio 代理分流']]} onChange={v => change('architecture',v)} /></Settings>;
  return <Settings><button type="button" disabled={s.desired.v2 === 0} onClick={() => change('weightV2',0)}>将 v2 权重降到 0%</button>
    <Toggle label="暂停规则下发" checked={s.hold} onChange={v => change('hold',v)} /></Settings>;
}

export const meshViews = {visuals: {preview: Preview, weights: Weights, executor: Executor, rollback: Rollback},
  Readout: MeshReadout, Settings: MeshSettings};

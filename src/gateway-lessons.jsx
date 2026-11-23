import React from 'react';
import {Board, Readout, Table, Settings, Choice, ChoiceButtons, Toggle, Bar, serverName} from './lesson-controls.jsx';
import {GatewayLimit} from './gateway-inputs.jsx';

function Routes({frame}) {
  const s = frame.state;
  return <Board tone="ink" title="网关路由表" note="商城 API">
    <Table label="已配置的网关路由" columns={['方法', '路径', '转发目标']} rows={[
      ['GET', <code>/products/42</code>, '商品服务'], ['POST', <code>/orders</code>, '订单服务']
    ]} />
    <div className="lesson-result"><code>{s.separateProbe.split(' → ')[0]}</code>
      <strong className={s.probeStatus >= 400 ? 'bad' : 'good'}>HTTP {s.probeStatus}</strong></div>
  </Board>;
}

function Limit({frame}) {
  const {window: w, batch} = frame.state;
  return <Board tone="mint" title="这一秒的商品请求" note={w.offered + ' 笔到达'}>
    <div className="lesson-split">
      <div><span>放行</span><strong>{w.passed}<small> 笔</small></strong></div>
      <div><span>返回 429</span><strong>{w.blocked}<small> 笔</small></strong></div>
    </div>
    <div className="lesson-band" aria-hidden="true"><i style={{width: (w.passed / w.offered * 100) + '%'}} /></div>
    <div className="lesson-arrivals"><span>最先到达的 10 笔</span>
      <ol>{batch.requests.slice(0,10).map(r => <li key={r.index} data-pass={r.code === 200}
        aria-label={'第 ' + r.index + ' 笔，HTTP ' + r.code}>{r.index}</li>)}</ol></div>
  </Board>;
}

function Balance({frame}) {
  const {window: w} = frame.state;
  return <Board title="商品请求分给了谁？" note={'共放行 ' + w.passed + ' 笔'}>
    <div className="lesson-bars">{w.hits.map((n, i) => <div key={i}>
      <div><b>{serverName(i + 1)}</b><span>{w.rt[i]} ms</span><strong>{n} 笔</strong></div>
      <Bar value={n} max={w.passed} tone={i ? 'purple' : 'mint'} /></div>)}</div>
    <div className="lesson-result"><span>放行请求的平均耗时</span><strong>{w.latency} ms</strong></div>
  </Board>;
}

function Aggregate({frame}) {
  const {page} = frame.state;
  return <Board tone="ink" title="浏览器发出的请求" note={page.calls.length + ' 次'}>
    <ul className="lesson-endpoints">{page.calls.map(call => <li key={call}><code>{call}</code></li>)}</ul>
    <div className="lesson-result"><span>网关读取</span><strong>商品、库存、评论</strong></div>
  </Board>;
}

function GatewayReadout({record, frame}) {
  const s = frame.state, w = s.window;
  if (record.id === 'routes') {
    const packet = frame.model.batch.requests[0];
    const target = frame.model.nodes.find(n => n.id === packet.to).label;
    return <Readout title="这笔请求的去向" columns={['检查项','结果']}
      rows={[['访问令牌',s.requestType === 'no-token' ? '缺少令牌' : '携带令牌'],['终点',target],['响应','HTTP ' + packet.code]]}
      stats={[['本秒请求',1,'笔'],['到达后端',packet.to === 'reject' ? 0 : 1,'笔']]}
      note={s.separateProbe.split(' → ').slice(1).join(' → ')} />;
  }
  if (record.id === 'aggregate') return <Readout title="服务调用" columns={['数据来源','本次读取']}
    rows={s.page.reads.map(r => [r.name,'1 次'])} stats={[['客户端请求',s.page.calls.length,'次'],['读取后端',s.page.reads.length,'次']]} />;
  const rows = w.hits.map((count, i) => [serverName(i + 1), count + ' 笔', w.rt[i] + ' ms']);
  const stats = record.id === 'limit' ? [['入站',w.offered,'笔'],['放行',w.passed,'笔'],['拦截',w.blocked,'笔']] :
    [['放行',w.passed,'笔'],['平均耗时',w.latency,'ms']];
  return <Readout title="后端接单情况" columns={['实例','本秒接单','耗时']} rows={rows} stats={stats}
    note={s.flight ? s.flight.steps[s.flight.step] : undefined} />;
}

function GatewaySettings({record, frame, change, playback, index}) {
  const s = frame.state, choices = window.Lab.scenes.gateway.choices;
  if (record.id === 'routes') {
    function send(type) {
      change('requestType', type);
      playback.replaySecond(index);
    }
    return <Settings><ChoiceButtons label="发送请求" value={s.requestType}
      options={choices.requestTypes.filter(([type]) => type !== 'no-header')} onChange={send} /></Settings>;
  }
  if (record.id === 'limit') return <Settings>
    <GatewayLimit value={s.limit} onAction={change} />
    <button type="button" onClick={() => playback.replaySecond(index)}>重放同一秒流量</button>
    <button type="button" disabled={!s.window.passed} onClick={() => change('tracePass')}>跟踪放行请求</button>
    <button type="button" disabled={!s.window.blocked} onClick={() => change('trace429')}>跟踪 429</button>
    {s.flight && <><button type="button" disabled={s.flight.step + 1 === s.flight.steps.length}
      onClick={() => change('traceNext')}>下一跳</button><button type="button" onClick={() => change('endTrace')}>结束跟踪</button></>}
  </Settings>;
  if (record.id === 'balance') return <Settings>
    <Choice label="负载均衡策略" value={s.strategy} options={choices.strategies} onChange={v => change('strategy',v)} />
    <Toggle label="让商品服务器 02 变慢" checked={s.slow} onChange={v => change('slow',v)} />
    {s.strategy === 'weighted' && <Choice label="01 对 02 的权重" value={s.weight}
      options={[1,2,3,4,5].map(n => [n,n + ' ∶ 1'])} onChange={v => change('weight',v)} />}
  </Settings>;
  return <Settings><Toggle label="网关聚合" checked={s.aggregate} onChange={v => change('aggregate',v)} /></Settings>;
}

export const gatewayViews = {visuals: {routes: Routes, limit: Limit, balance: Balance, aggregate: Aggregate},
  Readout: GatewayReadout, Settings: GatewaySettings};

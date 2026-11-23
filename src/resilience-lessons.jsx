import React from 'react';
import {Board, Table, Readout, Settings, Choice, ChoiceButtons, Toggle, Bar, amounts, serverName} from './lesson-controls.jsx';

const breakers = {CLOSED:'闭合', OPEN:'打开', HALF_OPEN:'半开'};
const active = s => s.spaces[s.namespace];

function Response({frame}) {
  const last = active(frame.state).last;
  const detail = last.status !== 200 ? '整页请求失败' : last.reason === 'full' ? '显示商品、库存和评论' : '显示商品和库存';
  return <Board tone="mint" title="顾客收到的商品详情" note={'HTTP ' + last.status}>
    <Table label="商品响应内容" columns={['数据项','最近一笔的结果']} rows={[
      ['商品详情',last.status === 200 ? '已返回' : '整页请求失败'],
      ['库存',last.status === 200 ? '已返回' : '整页请求失败'],
      ['评论',last.reason === 'full' ? '已返回' : last.reason === 'timeout' ? '读取超时' : '未返回']
    ]} />
    <div className="lesson-result"><strong>{detail}</strong><span>整页响应 {last.rt} ms</span></div>
  </Board>;
}

function Distribution({frame}) {
  const space = active(frame.state);
  return <Board title="哪些实例已跳过评论？" note={'配置中心 v' + space.version}>
    <Table label="实例应用的降级版本" columns={['商品实例','配置版本','当前处理方式']} rows={space.instances.map(i =>
      [serverName(i.id),'v' + i.version + (i.pending ? '（v' + i.pending.version + ' 待生效）' : ''),i.skip ? '跳过评论' : '加载评论'])} />
  </Board>;
}

function Breaker({frame}) {
  const s = frame.state, space = active(s);
  return <Board tone="amber" title="每个实例有自己的断路器" note={'冷却 ' + s.openSeconds + ' 秒'}>
    <ol className="lesson-states"><li>闭合</li><li>打开</li><li>半开探测</li></ol>
    <Table label="各断路器当前状态" columns={['商品实例','状态','下一步']} rows={space.instances.map(i =>
      [serverName(i.id),breakers[i.breaker.state],i.breaker.state === 'OPEN' ? (i.breaker.until - s.time) + ' 秒后探测'
        : i.breaker.state === 'HALF_OPEN' ? '等待探测结果' : '统计评论调用'])} />
  </Board>;
}

function Retries({frame}) {
  const f = frame.state.retry.frame;
  const outcome = !f.successes ? '查询失败' : f.review > 1 ? '重试后成功' : '首次调用成功';
  return <Board title="一笔入口请求产生的调用" note={'评论调用 ' + f.review + ' 次'}>
    <div className="lesson-bars">{[['客户端 → 网关',f.gateway],['网关 → 商品',f.product],['商品 → 评论',f.review]].map(([title,count]) =>
      <div key={title}><div><b>{title}</b><strong>{count} 次</strong></div>
        <Bar value={count} max={Math.max(1,f.review)} tone="purple" /></div>)}</div>
    <div className="lesson-result"><span>这笔查询的结果</span><strong>{outcome}</strong></div>
  </Board>;
}

function ResilienceReadout({frame, record}) {
  const s = frame.state, space = active(s), f = space.frame;
  if (record.id === 'retry') {
    const r = s.retry, count = r.frame;
    return <Readout title="各层最多额外重试" columns={['调用方','重试上限']} rows={[
      ['客户端',r.clientRetries + ' 次'],['网关',r.gatewayRetries + ' 次'],['商品服务',r.productRetries + ' 次']
    ]} stats={[['入口请求',count.entrance,'笔'],['评论调用',count.review,'次'],['最终成功',count.successes,'笔']]} />;
  }
  if (record.id === 'timeout') return <Readout title="评论调用" columns={['参数','当前值']}
    rows={[['评论延迟',s.delay + ' ms'],['调用超时',s.timeout + ' ms'],['超时兜底',s.fallback ? '返回详情和库存' : '返回错误']]}
    stats={[['成功',f.ok,'笔'],['失败',f.requests - f.ok,'笔'],['平均响应',Math.round(f.rt / (f.requests || 1)),'ms']]} />;
  if (record.id === 'config') return <Readout title="商品实例接单情况" columns={['实例','配置','评论调用']}
    rows={space.instances.map(i => [serverName(i.id),'v' + i.version,i.frameCalls + ' 次'])}
    stats={[['本秒查询',f.requests,'笔'],['跳过评论',f.manual,'笔'],['平均响应',f.requests ? Math.round(f.rt / f.requests) : '—','ms']]} />;
  return <Readout title="熔断判定" columns={['规则','当前值']}
    rows={[['慢调用', '超过 ' + s.maxRT + ' ms'],['统计窗口',s.window + ' 秒'],['打开条件','至少 ' + s.minRequests + ' 次，慢调用占比超过 ' + s.threshold + '%']]}
    stats={[['查评论',f.calls,'次'],['熔断跳过',f.circuit,'笔'],['成功响应',f.ok,'笔']]} />;
}

function ResilienceSettings({frame, record, change}) {
  const s = frame.state, space = active(s);
  if (record.id === 'config') return <Settings>
    <Choice label="发布范围" value={space.scope} options={[['all','全部实例'],...space.instances.map(i => [i.id,serverName(i.id)])]}
      onChange={v => change('scope',v)} />
    <Toggle label="跳过评论" checked={space.draft} onChange={v => change('draft',v)} />
    <button type="button" onClick={() => change('publish')}>发布配置</button>
    <button type="button" disabled={space.instances.length >= 8} onClick={() => change('add')}>启动商品实例</button>
  </Settings>;
  if (record.id === 'retry') return <Settings>
    {[['clientRetries','客户端重试'],['gatewayRetries','网关重试'],['productRetries','商品服务重试']].map(([key,label]) =>
      <Choice key={key} label={label} value={s.retry[key]} options={amounts([0,1,2],'次')} onChange={v => change(key,v)} />)}
    <ChoiceButtons label="评论调用" value={s.retry.failFirstOnly ? 'first-only' : s.retry.failure}
      options={[[0,'正常'],['first-only','仅首次失败'],[100,'持续失败']]} onChange={v => change('layerFailure',v)} />
  </Settings>;
  return <Settings>
    <Choice label="评论延迟" value={s.delay} options={amounts([100,250,400,900],'ms')} onChange={v => change('delay',v)} />
    {record.id === 'timeout' ? <Toggle label="评论超时后返回详情和库存" checked={s.fallback} onChange={v => change('fallback',v)} /> :
      <Choice label="熔断冷却时间" value={s.openSeconds} options={amounts([2,4,6,8],'秒')} onChange={v => change('openSeconds',v)} />}
  </Settings>;
}

export const resilienceViews = {visuals: {timeout: Response, config: Distribution, breaker: Breaker, retry: Retries},
  Readout: ResilienceReadout, Settings: ResilienceSettings};

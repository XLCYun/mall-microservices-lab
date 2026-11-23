import React from 'react';
import {Board, Readout, Settings, ChoiceButtons, Bar, amounts, serverName} from './lesson-controls.jsx';

const status = {ready:'就绪', starting:'启动中', draining:'已摘流'};

function Capacity({frame}) {
  const s = frame.state, w = s.window;
  return <div className="scale-policy">
    <section className="origin-conf scale-yaml" aria-label="商品服务的 HPA 配置">
      <header className="origin-conf-header">
        <strong>product-hpa.yaml</strong>
        <a href="https://kubernetes.io/zh-cn/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/"
          target="_blank" rel="noreferrer">Kubernetes HPA 文档 ↗</a>
      </header>
      <pre><code>{`apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: {name: product}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: product
`}<em>{`  minReplicas: ${s.min}
  maxReplicas: ${s.max}`}</em>{`
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
`}<em>{`          averageUtilization: ${s.target}`}</em>{`
  behavior:
    scaleDown: {stabilizationWindowSeconds: ${s.stabilize}}`}</code></pre>
    </section>
    <section className="scale-sample" aria-label="本轮副本计算">
      <div className="lesson-bars"><div><div><b>采样 CPU</b><strong>{w.sampled}%</strong></div>
        <Bar value={w.sampled} tone="purple" /></div><div><div><b>目标 CPU</b><strong>{w.target}%</strong></div>
        <Bar value={w.target} /></div></div>
      <div className="lesson-calculation"><code>{w.before} × {w.sampled}% ÷ {w.target}%</code>
        <span>向上取整 {w.raw} 台，按副本范围取 <b>{w.recommend} 台</b></span></div>
    </section>
  </div>;
}

function Warming({frame}) {
  const s = frame.state;
  return <Board tone="mint" title="就绪实例才接流量" note={'期望 ' + s.desired + ' 台'}>
    <ul className="lesson-fleet scale-fleet">{s.instances.map(p => <li key={p.id} data-state={p.status}>
      <strong>{serverName(p.id)}</strong>
      <span>{status[p.status]}{p.status === 'starting' && ' · 还需 ' + (p.transitionAt - s.time) + ' 秒'}</span>
      <div className="scale-pod-load"><span>本秒接单 <b>{p.received} 笔</b></span>
        <span>CPU <b>{p.status === 'ready' ? p.cpu + '%' : '未采样'}</b></span></div>
      <Bar value={p.cpu} tone={p.cpu === 100 ? 'hot' : 'mint'} />
    </li>)}</ul>
  </Board>;
}

function Cooldown({frame}) {
  const s = frame.state, w = s.window;
  const draining = s.instances.filter(p => p.status === 'draining').length;
  return <Board tone="amber" title="什么时候可以缩容？" note={'稳定窗口 ' + s.stabilize + ' 秒'}>
    <div className="lesson-split"><div><span>本秒建议</span><strong>{w.recommend}<small> 台</small></strong></div>
      <div><span>控制器期望</span><strong>{s.desired}<small> 台</small></strong></div></div>
    <div className="lesson-result"><span>当前状态</span><strong>{w.wait ? '还需等待 ' + w.wait + ' 秒'
      : draining ? draining + ' 台已摘流，等待退出' : '已按当前负载分配'}</strong></div>
  </Board>;
}

function ScaleReadout({frame}) {
  const s = frame.state, w = s.window;
  return <Readout title="商品副本" columns={['实例','状态','本秒接单']}
    rows={s.instances.map(p => [serverName(p.id),status[p.status],p.received + ' 笔'])}
    stats={[['进站流量',w.incoming,'QPS'],['平均 CPU',w.mean,'%'],['就绪 / 期望',w.ready + '/' + s.desired,'台']]} />;
}

const mapSettings = {
  baseline: {key: 'target', label: '目标 CPU', options: amounts([40,50,60,70,80,90],'%')},
  'scale-out': {key: 'max', label: '最多副本', options: amounts([2,3,4,5,6],'台')},
  'scale-in': {key: 'stabilize', label: '缩容稳定窗口', options: amounts([2,3,5,8,12],'秒')}
};

function ScaleSettings({frame, record, change}) {
  const s = frame.state;
  const {normal,rush,quiet} = window.Lab.workloads.scale;
  const profiles = [['normal','平稳 · ' + normal + ' QPS'],['rush','高峰 · ' + rush + ' QPS'],['quiet','回落 · ' + quiet + ' QPS']];
  const setting = mapSettings[record.id];
  function select(key, value) {
    if (s[key] !== value) change(key, value);
  }
  return <Settings>
    <ChoiceButtons label="入站流量" value={s.profile} options={profiles} onChange={v => select('profile',v)} />
    <ChoiceButtons label={setting.label} value={s[setting.key]} options={setting.options}
      onChange={v => select(setting.key,v)} />
  </Settings>;
}

export const scaleViews = {visuals: {baseline: Capacity, 'scale-out': Warming, 'scale-in': Cooldown},
  Readout: ScaleReadout, Settings: ScaleSettings};

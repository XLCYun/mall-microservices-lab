import React, {useId, useState} from 'react';
import {originSlides} from './registry-origin-slides.jsx';
import {mapSlides} from './registry-map-slides.jsx';
import {deploymentFrames} from './registry-deployment.js';
import {DeploymentControls, DeploymentDirectory} from './registry-deployment-view.jsx';
import {ControlIcon, pad} from './walkthrough.jsx';

const roster = ids => ids.length ? ids.map(pad).join('、') : '空';

function RegistryDirectory({entries, gateway, showTraffic}) {
  const title = useId();
  const serviceName = window.Lab.scenes.registry.service.name;
  return (
    <section className="registry-directory" aria-labelledby={title}>
      <header className="registry-directory-head">
        <h3 id={title}><ControlIcon name="layers" />注册中心
          <code className="registry-service-name" aria-label={'服务名 ' + serviceName}>{serviceName}</code>
        </h3>
        <span>已登记 <b>{entries.length}</b> 台</span>
      </header>
      <table aria-label="已登记的商品服务器">
        <thead>
          <tr><th scope="col">实例地址</th><th scope="col">最近上报</th><th scope="col">{showTraffic ? '本秒接单' : '漏收心跳'}</th></tr>
        </thead>
        <tbody>
          {entries.length === 0 && <tr><td className="registry-empty" colSpan={3}>当前没有已登记的实例</td></tr>}
          {entries.map(({id, name, address, lastReport, missed, received}) => (
            <tr key={id} data-late={missed > 0}>
              <th scope="row">{name}<code>{address}</code></th>
              <td>
                <time dateTime={'PT' + lastReport.at + 'S'}>T+{pad(lastReport.at)} 秒</time>
                <small>{lastReport.kind === 'register' ? '注册' : '心跳'}</small>
              </td>
              <td>{showTraffic ? <span className="registry-received">{received} 笔</span> :
                <span className="registry-missed">{missed} 次</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="registry-cache"><dt>网关名单</dt><dd>{roster(gateway)}</dd></dl>
    </section>
  );
}

function TimingSelect({label, policy, value, onChange}) {
  return (
    <label>{label}
      <select value={value} onChange={event => onChange(Number(event.target.value))}>
        {Array.from({length: policy.max - policy.min + 1}, (_, i) => policy.min + i).map(seconds =>
          <option key={seconds} value={seconds}>{seconds} 秒</option>)}
      </select>
    </label>
  );
}

function ScenarioControls({frame, onChange, onRevisitOutage}) {
  const [open, setOpen] = useState(true);
  const timingId = useId();
  const {heartbeatPolicy, expiryPolicy, expiryNote} = window.Lab.scenes.registry;
  return (
    <div className="registry-settings" role="group" aria-label="场景控制">
      <span className="registry-settings-label">场景控制</span>
      {onRevisitOutage && <button type="button" onClick={onRevisitOutage}>重现掉线请求</button>}
      <button type="button" className="registry-server-action" onClick={() => onChange('instance')}>
        {frame.serverOnline ? '让商品服务器 ' + pad(frame.selectedServer) + ' 掉线' : '启动商品服务器 ' + pad(frame.selectedServer)}
      </button>
      <label className="registry-retry">
        <input type="checkbox" checked={frame.retry} onChange={event => onChange('retry', event.target.checked)} />
        失败后换一台重试
      </label>
      <button type="button" className="registry-timing-trigger" aria-expanded={open} aria-controls={timingId}
        onClick={() => setOpen(!open)}>心跳设置<span aria-hidden="true" /></button>
      <div id={timingId} className="registry-timings" hidden={!open}>
        <TimingSelect label="心跳周期" policy={heartbeatPolicy} value={frame.heartbeat}
          onChange={value => onChange('heartbeat', value)} />
        <TimingSelect label="心跳剔除时间" policy={expiryPolicy} value={frame.expire}
          onChange={value => onChange('expire', value)} />
        <span className="registry-policy">{expiryNote(frame)}</span>
      </div>
    </div>
  );
}

function RegistryVisual({record, frame}) {
  const {service, heartbeatPolicy, expiryPolicy, maxInstances} = window.Lab.scenes.registry;
  const Visual = record.slide.Visual;
  return <Visual service={service} maxInstances={maxInstances} heartbeat={heartbeatPolicy.initial}
    expiry={expiryPolicy.initial} frame={frame} />;
}

function LaunchButton({frame, change}) {
  return <button type="button" className="registry-launch" disabled={frame.nextServerId === null}
    onClick={() => change('add')}>
    {frame.nextServerId === null ? '已达服务器数量上限' :
      <><span aria-hidden="true">＋</span>启动商品服务器 {pad(frame.nextServerId)}</>}
  </button>;
}

function RegistryReadout({record, frame}) {
  return <>
    {record.deployment ? <DeploymentDirectory id={record.id} frame={frame} /> :
      <RegistryDirectory entries={frame.entries} gateway={frame.gateway} showTraffic={record.allowLaunch} />}
    <div>
      {record.outageSecond !== undefined && <dl className="registry-query-trace">
        <dt>网关转发的一笔 GET 查询</dt><dd>{frame.trace}</dd>
      </dl>}
      <dl className="registry-outcome" aria-label="本秒请求结果">
        <div><dt>本秒成功</dt><dd>{frame.success}<small> 笔</small></dd></div>
        <div data-failed={frame.failed > 0}><dt>本秒失败</dt><dd>{frame.failed}<small> 笔</small></dd></div>
        {frame.recovered > 0 && <div><dt>其中重试成功</dt><dd>{frame.recovered}<small> 笔</small></dd></div>}
      </dl>
    </div>
  </>;
}

function RegistrySettings({record, frame, change, playback, index}) {
  if (record.deployment) return <DeploymentControls id={record.id} frame={frame} onChange={change} />;
  return <ScenarioControls frame={frame} onChange={change} onRevisitOutage={record.outageSecond === undefined
    ? undefined : () => playback.revisit(index, record.outageSecond)} />;
}

export function registryRecords(lab) {
  const records = [...deploymentFrames(lab), ...lab.registryFrames()];
  return [...originSlides, ...mapSlides].map(slide => {
    const record = records.find(r => r.id === slide.map);
    return {...record, slide, Visual: RegistryVisual, Readout: RegistryReadout, Settings: RegistrySettings,
      HeaderAction: record.allowLaunch ? LaunchButton : null};
  });
}

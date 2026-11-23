import React, {useId} from 'react';
import {deploymentRates} from './registry-deployment.js';

const number = id => String(id).padStart(2, '0');

export function DeploymentDirectory({id, frame}) {
  const title = useId();
  const heading = id === 'elastic' ? '商品实例与固定名单' : 'NGINX 固定名单';
  const showOrder = id === 'nginx';
  return <section className="registry-directory" aria-labelledby={title}>
    <header className="registry-directory-head">
      <h3 id={title}>{heading}</h3>
      <span>已配置 {frame.configured.length} 个地址</span>
    </header>
    <table aria-label={heading}>
      <thead><tr><th scope="col">实例地址</th><th scope="col">{id === 'elastic' ? '状态 / 配置' : '状态'}</th><th scope="col">本秒接单</th></tr></thead>
      <tbody>{frame.entries.map(entry => <tr key={entry.id} data-late={!entry.online && entry.listed}>
        <th scope="row">{entry.name}<code>{entry.address}</code></th>
        <td className="deployment-status">{entry.online ? '在线' : '已下线'}
          {id === 'elastic' && <small>{entry.listed ? '已写入' : '未写入'}</small>}
        </td>
        <td className="registry-received">{entry.received} 笔</td>
      </tr>)}</tbody>
    </table>
    {id !== 'single' && <dl className={'registry-cache' + (showOrder ? ' deployment-order' : '')}>
      <dt>{showOrder ? '本秒接单顺序' : '当前 upstream'}</dt>
      <dd>{(showOrder ? frame.order : frame.configured).map(number).join(showOrder ? ' → ' : '、')}</dd>
    </dl>}
  </section>;
}

export function DeploymentControls({id, frame, onChange}) {
  const single = id === 'single';
  const elastic = id === 'elastic';
  const target = single ? frame.entries[0] : frame.entries[1];
  const third = frame.entries.find(entry => entry.id === 3);
  return <div className="registry-settings deployment-settings" role="group" aria-label="场景控制">
    <span className="registry-settings-label">场景控制</span>
    <label>每秒请求数
      <select value={frame.rate} onChange={event => onChange('rate', Number(event.target.value))}>
        {deploymentRates.map(rate => <option key={rate} value={rate}>{rate} 笔</option>)}
      </select>
    </label>
    {elastic && <>
      <button type="button" disabled={Boolean(third)} onClick={() => onChange('add')}>
        {third ? '商品服务器 03 已启动' : '启动商品服务器 03'}
      </button>
      <button type="button" disabled={!third || third.listed} onClick={() => onChange('addAddress', 3)}>
        写入 03 地址并重载
      </button>
      <button type="button" disabled={!target.listed && !target.online}
        onClick={() => onChange(target.listed ? 'removeAddress' : 'addAddress', 2)}>
        {target.listed ? '移除 02 地址并重载' : '加回 02 地址并重载'}
      </button>
    </>}
    {(single || elastic) && <button type="button" onClick={() => onChange('instance')}>
      {(target.online ? '下线' : '启动') + target.name}
    </button>}
  </div>;
}

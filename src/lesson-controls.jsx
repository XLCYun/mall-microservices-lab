import React from 'react';

export function Board({tone = 'violet', title, note, children}) {
  return <div className={'lesson-board lesson-' + tone}>
    <header><h3>{title}</h3>{note && <span>{note}</span>}</header>{children}
  </div>;
}

export function Table({columns, rows, label}) {
  return <table className="lesson-table" aria-label={label}>
    <thead><tr>{columns.map(c => <th scope="col" key={c}>{c}</th>)}</tr></thead>
    <tbody>{rows.map(([name, ...cells]) => <tr key={name}>
      <th scope="row">{name}</th>{cells.map((value, i) => <td key={i}>{value}</td>)}
    </tr>)}</tbody>
  </table>;
}

export function Readout({title, columns, rows, stats, note}) {
  return <>
    <section className="lesson-readout" aria-label={title}>
      <h3>{title}</h3><Table label={title} columns={columns} rows={rows} />
      {note && <p>{note}</p>}
    </section>
    <dl className="registry-outcome" aria-label="本秒模拟结果">
      {stats.map(([name, value, unit]) => <div key={name}><dt>{name}</dt><dd>{value}<small> {unit}</small></dd></div>)}
    </dl>
  </>;
}

export function Choice({label, value, options, onChange}) {
  return <label>{label}<select aria-label={label} value={value} onChange={e => onChange(e.target.value)}>
    {options.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>;
}

export function ChoiceButtons({label, value, options, onChange}) {
  return <div className="lesson-choice-buttons" role="group" aria-label={label}>
    <span>{label}</span>
    {options.map(([key, name]) => <button type="button" key={key}
      aria-pressed={value === key} onClick={() => onChange(key)}>{name}</button>)}
  </div>;
}

export function Toggle({label, checked, onChange}) {
  return <label className="registry-retry"><input type="checkbox" checked={checked}
    onChange={e => onChange(e.target.checked)} />{label}</label>;
}

export function Settings({children}) {
  return <div className="registry-settings lesson-settings" role="group" aria-label="场景控制">
    <span className="registry-settings-label">场景控制</span>{children}</div>;
}

export function Bar({value, max = 100, tone = 'mint'}) {
  return <div className={'lesson-bar ' + tone} aria-hidden="true"><i style={{width: Math.max(0,Math.min(100,value / Math.max(1,max) * 100)) + '%'}} /></div>;
}

export const amounts = (values, unit) => values.map(n => [n, n + ' ' + unit]);
export const serverName = id => '商品服务器 ' + String(id).replace(/^product-/, '').padStart(2, '0');

import React, { useId } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { guides } from './lesson-guides.jsx';
import { GatewayLimit, RangeField } from './gateway-inputs.jsx';
import { playbackRates } from './walkthrough-player.js';
import { PhoneOverview, PhoneWorkspace } from './phone-workspace.jsx';
import { ContractOverview, ContractWorkspace } from './contract-workspace.jsx';
import { sendPhone } from './phone-client.js';

const playbackSpeeds = [...playbackRates, 2, 4];

function SelectField({ name, label, value, options, onAction }) {
  return (
    <label className="field select-field">
      <span>{label}</span>
      <select
        data-key={name}
        aria-label={label}
        value={value}
        onChange={event => onAction(name, event.currentTarget.value, event.currentTarget)}
      >
        {options.map(([key, title]) => <option key={key} value={key}>{title}</option>)}
      </select>
    </label>
  );
}

function ToggleField({ name, label, checked, onAction }) {
  return (
    <label className="toggle-field">
      <span>{label}</span>
      <input
        type="checkbox"
        data-key={name}
        aria-label={label}
        checked={checked}
        onChange={event => onAction(name, event.currentTarget.checked, event.currentTarget)}
      />
      <span className="switch-track" aria-hidden="true" />
    </label>
  );
}

function ActionButton({ action, onAction, className = '', children, ...attributes }) {
  function activate(event) {
    // The action may remove its own button before the click reaches the
    // document listener that serves the other scenes.
    event.stopPropagation();
    onAction(action, '', event.currentTarget);
  }
  return (
    <button
      type="button"
      className={'control-button ' + className}
      data-act={action}
      onClick={activate}
      {...attributes}
    >
      {children}
    </button>
  );
}

function TraceControls({ flight, onAction }) {
  return (
    <div className="control-group">
      <div className="button-row">
        <ActionButton action="tracePass" onAction={onAction} aria-pressed={flight?.accepted === true}>
          跟踪放行请求
        </ActionButton>
        <ActionButton action="trace429" onAction={onAction} aria-pressed={flight?.accepted === false}>
          跟踪 429
        </ActionButton>
      </div>
      {flight && (
        <>
          <p className="panel-note" role="status">
            跟踪 #{flight.index} · {flight.step + 1}/{flight.steps.length}　{flight.steps[flight.step]}
          </p>
          <div className="button-row">
            <ActionButton action="traceNext" onAction={onAction} disabled={flight.step + 1 >= flight.steps.length}>
              查看下一跳
            </ActionButton>
            <ActionButton action="endTrace" onAction={onAction}>回到整秒流量</ActionButton>
          </div>
        </>
      )}
    </div>
  );
}

function AdvancedControls({ state, requestTypes, onAction }) {
  const panelId = useId();
  return (
    <>
      <ActionButton
        action="advanced"
        className="advanced-button"
        aria-expanded={state.advanced}
        aria-controls={panelId}
        onAction={onAction}
      >
        慢实例、路由与鉴权
      </ActionButton>
      <div id={panelId} className="advanced-controls" hidden={!state.advanced}>
        <ToggleField name="slow" label="让商品 02 变慢" checked={state.slow} onAction={onAction} />
        {state.strategy === 'weighted' && (
          <RangeField
            name="weight"
            label="商品 01 权重（其他为 1）"
            min={1}
            max={5}
            value={state.weight}
            onAction={onAction}
          />
        )}
        <ToggleField
          name="headerRule"
          label="商品路由要求 X-Channel: sale"
          checked={state.headerRule}
          onAction={onAction}
        />
        <SelectField
          name="requestType"
          label="单独发送的请求"
          value={state.requestType}
          options={requestTypes}
          onAction={onAction}
        />
        <ActionButton action="sendProbe" onAction={onAction}>发送路由探针</ActionButton>
        <ToggleField
          name="aggregate"
          label="网关聚合商品、库存与评论"
          checked={state.aggregate}
          onAction={onAction}
        />
        <ActionButton action="pageVisit" onAction={onAction}>模拟打开详情页</ActionButton>
        {state.pageResult && <p className="panel-note" role="status">{state.pageResult}</p>}
      </div>
    </>
  );
}

function GatewaySidebar({ state, onAction }) {
  const { strategies, requestTypes } = window.Lab.scenes.gateway.choices;
  return (
    <div className="control-group">
      <SelectField
        name="strategy"
        label="负载均衡策略"
        value={state.strategy}
        options={strategies}
        onAction={onAction}
      />
      <ActionButton action="replay" className="primary" onAction={onAction}>重放同一秒流量</ActionButton>
      <TraceControls flight={state.flight} onAction={onAction} />
      <ActionButton action="sendOrder" onAction={onAction}>另发一笔订单请求</ActionButton>
      {state.separateProbe && <p className="panel-note" role="status">{state.separateProbe}</p>}
      <AdvancedControls state={state} requestTypes={requestTypes} onAction={onAction} />
    </div>
  );
}

function PlaybackIcon({ name }) {
  // These fixed glyphs come from the same local icon set as the scene header.
  return <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: window.Lab.ui.icon(name, 16) }} />;
}

function Player({ playing, completed, speed, timeText, onShell, onSpeed }) {
  return (
    <>
      <div className="transport-actions">
        <button
          type="button"
          id="play-button"
          disabled={completed && !playing}
          className="play-button"
          data-shell="play"
          aria-label={playing ? '暂停模拟' : '运行模拟'}
          onClick={() => onShell('play')}
        >
          <PlaybackIcon name={playing ? 'pause' : 'play'} />
          {playing ? '暂停' : '运行'}
        </button>
        <button
          type="button"
          className="transport-button"
          data-shell="step"
          disabled={completed}
          aria-label="单步"
          onClick={() => onShell('step')}
        >
          <PlaybackIcon name="step" />单步
        </button>
        <button
          type="button"
          className="transport-button"
          data-shell="reset"
          aria-label="重置本幕"
          onClick={() => onShell('reset')}
        >
          <PlaybackIcon name="reset" />重置本幕
        </button>
      </div>
      <div className="clock-tools">
        <span id="sim-clock" className="sim-time" role="timer" aria-label="模拟经过的时间" title="模拟经过的时间">
          {timeText}
        </span>
        <select
          id="speed"
          aria-label="播放速度"
          value={speed}
          onChange={event => onSpeed(Number(event.currentTarget.value))}
        >
          {playbackSpeeds.map(rate => (
            <option key={rate} value={rate}>{rate}×{rate < 1 ? ' 慢放' : ''}</option>
          ))}
        </select>
      </div>
    </>
  );
}

const testingViews = {
  phone: { Overview: PhoneOverview, Workspace: PhoneWorkspace },
  contract: { Overview: ContractOverview, Workspace: ContractWorkspace }
};

function SimulationControls({ inline, side, sceneId, state, overviewHost, workbenchHost, playing, completed, speed, timeText, onAction, onShell, onSpeed }) {
  const view = testingViews[sceneId];
  return (
    <>
      <Player playing={playing} completed={completed} speed={speed} timeText={timeText} onShell={onShell} onSpeed={onSpeed} />
      {view && createPortal(<view.Overview state={state} onAction={onAction} onShell={onShell} playing={playing} />, overviewHost)}
      {view && createPortal(<view.Workspace state={state} onAction={onAction} />, workbenchHost)}
      {sceneId === 'gateway' && inline && createPortal(
        <GatewayLimit value={state.limit} onAction={onAction} />, inline, 'gateway-limit'
      )}
      {sceneId === 'gateway' && side && createPortal(
        <GatewaySidebar state={state} onAction={onAction} />, side, 'gateway-sidebar'
      )}
    </>
  );
}

let mounted = null;

function unmount() {
  if (!mounted) return;
  mounted.root.unmount();
  mounted = null;
}

function render(props) {
  if (mounted?.container !== props.transport) {
    unmount();
    mounted = { container: props.transport, root: createRoot(props.transport) };
  }
  mounted.root.render(<SimulationControls {...props} />);
}

window.Lab.gatewayUI = { render, unmount };
window.Lab.phoneClient = { send: sendPhone };
window.Lab.guides = guides;

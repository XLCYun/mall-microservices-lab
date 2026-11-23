import React, {useId, useLayoutEffect, useRef} from 'react';

export function RangeField({name, label, value, min, max, step = 1, unit, onAction}) {
  const id = useId();
  const captionId = id + '-label';
  const lastValue = useRef(value);
  useLayoutEffect(() => {
    lastValue.current = value;
  }, [value]);

  function update(event) {
    const input = event.currentTarget;
    const next = input.valueAsNumber;
    if (next === lastValue.current) return;
    lastValue.current = next;
    onAction(name, next, input);
  }

  return <label className="field range-field" htmlFor={id} data-gateway-ui="">
    <span className="field-line">
      <span id={captionId}>{label}</span>
      <output htmlFor={id}>{value}{unit && <small>{unit}</small>}</output>
    </span>
    <input id={id} type="range" data-key={name} data-unit={unit} min={min} max={max}
      step={step} value={value} aria-labelledby={captionId} aria-valuetext={unit ? value + ' ' + unit : undefined}
      style={{'--range-fill': ((value - min) / (max - min)) * 100 + '%'}}
      onInput={update} onChange={update} />
  </label>;
}

export function GatewayLimit({value, onAction}) {
  return <RangeField name="limit" label="商品接口限流阈值" min={0} max={window.Lab.workloads.gateway.max}
    step={1} unit="QPS" value={value} onAction={onAction} />;
}

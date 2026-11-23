function Registration({service}) {
  return (
    <div className="map-slide-registration">
      <img className="map-slide-address-book" src="./art/service-discovery.webp"
        alt="" width="887" height="887" />
      <div className="map-slide-registrations">
        <table>
          <caption>注册中心登记表</caption>
          <thead><tr><th scope="col">实例</th><th scope="col">服务名</th><th scope="col">IP 地址</th><th scope="col">端口</th></tr></thead>
          <tbody>{[1, 2].map(id =>
            <tr key={id}>
              <th scope="row">商品服务器 {String(id).padStart(2, '0')}</th>
              <td><code>{service.name}</code></td>
              <td><code>{service.ip(id)}</code></td>
              <td><code>{service.port}</code></td>
            </tr>
          )}</tbody>
        </table>
      </div>
      <small className="map-slide-source">《微服务治理》讲义 · 第 5–7、15 页</small>
    </div>
  );
}

function Heartbeat({heartbeat}) {
  return (
    <div className="map-slide-board map-slide-heartbeat">
      <header className="map-slide-board-head">
        <h3>注册中心收到的心跳</h3><time dateTime="PT1S">T+1 秒</time>
      </header>
      <ul className="map-slide-inbox">
        <li>
          <span>商品服务器 <b>01</b></span>
          <span className="map-slide-heart-path" aria-hidden="true"><i>♥</i></span>
          <strong>收到心跳</strong>
        </li>
        <li>
          <span>商品服务器 <b>02</b></span>
          <span className="map-slide-heart-path map-slide-heart-missing" aria-hidden="true"><i>×</i></span>
          <strong>未收到</strong>
        </li>
      </ul>
      <dl className="map-slide-heart-summary">
        <div><dt>默认心跳周期</dt><dd>{heartbeat} 秒</dd></div>
        <div><dt>仍在注册表中的实例</dt><dd>01、02</dd></div>
      </dl>
    </div>
  );
}

function Expiry({expiry}) {
  const extended = 5;
  const lastSecond = Math.max(expiry, extended);
  const seconds = Array.from({length: lastSecond + 1}, (_, n) => n);
  return (
    <div className="map-slide-board map-slide-expiry">
      <header className="map-slide-board-head"><h3>两种剔除时限下的地址移除时间</h3></header>
      <p className="map-slide-origin">商品服务器 02 在第 0 秒注册，此后没有再发送心跳。</p>
      <table className="map-slide-timechart" aria-label="两种剔除时限下，02 在注册表中保留的模拟秒数">
        <thead><tr><th scope="col">剔除时限</th>{seconds.map(s => <th scope="col" key={s}>{s} 秒</th>)}</tr></thead>
        <tbody>
          {[expiry, extended].map((limit, index) => (
            <tr key={index}>
              <th scope="row">{index === 0 ? '默认' : '调到'} {limit} 秒</th>
              <td colSpan={limit} className="map-slide-still-listed">保留地址</td>
              <td className="map-slide-removed">剔除</td>
              {limit < lastSecond && <td colSpan={lastSecond - limit} aria-label="已移除" />}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="map-slide-expiry-result">剔除后，6 笔新请求都直达 <strong>01</strong>。点下图“重现掉线请求”，切换“失败后换一台重试”，可以比较剔除前的结果。</p>
    </div>
  );
}

function Lookup({service, frame}) {
  const rosters = [
    {title: '网关的本地名单', ids: frame.gateway},
    {title: '注册中心的名单', ids: frame.registry}
  ];
  return (
    <div className="map-slide-board map-slide-lookup">
      <header className="map-slide-board-head">
        <h3>商品服务的两份名单</h3><time dateTime={'PT' + frame.second + 'S'}>T+{frame.second} 秒</time>
      </header>
      <div className="map-slide-exchange" aria-label="网关向注册中心查询服务，注册中心向网关推送变更">
        <span className="map-slide-party">商城网关</span>
        <div className="map-slide-messages">
          <div><span>查询 <code>{service.name}</code></span><i aria-hidden="true">→</i></div>
          <div><i aria-hidden="true">←</i><span>推送新名单</span></div>
        </div>
        <span className="map-slide-party">注册中心</span>
      </div>
      <div className="map-slide-rosters">
        {rosters.map(({title, ids}) => (
          <section className="map-slide-roster" key={title} aria-label={title}>
            <h4>{title}</h4>
            <ul>
              {ids.map(id => <li key={id}>
                <span>商品服务器 <b>{String(id).padStart(2, '0')}</b></span>
                <code>{service.endpoint(id)}</code>
              </li>)}
              {ids.length === 0 && <li>暂无可用地址</li>}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function ServerLaunches({frame, maxInstances}) {
  const servers = Array.from({length: maxInstances}, (_, i) => i + 1);
  return (
    <div className="map-slide-board map-slide-launches">
      <header className="map-slide-board-head">
        <h3>商品服务器</h3><span>已登记 <b>{frame.entries.length}</b> 台 · 本秒 {frame.success + frame.failed} 笔请求</span>
      </header>
      <ul className="map-slide-servers" aria-label="各台商品服务器的启动与接单情况">
        {servers.map(id => {
          const node = frame.model.nodes.find(n => n.id === 'product-' + id);
          const entry = frame.entries.find(e => e.id === id);
          const status = node?.status ?? 'unused';
          const label = {up: '已登记', down: '掉线', pending: '待登记', unused: '待启动'}[status];
          return <li key={id} data-status={status}>
            <strong>商品服务器 {String(id).padStart(2, '0')}</strong>
            <span>{label}{node && ' · 本秒接单 ' + (entry?.received ?? 0) + ' 笔'}</span>
          </li>;
        })}
      </ul>
    </div>
  );
}

export const mapSlides = [
  {
    id: 'registration', map: 'normal', chapter: 4, label: '实例主动注册',
    title: '什么是服务发现？',
    lead: '商品服务要随流量动态扩缩容，实例一增一减，网关的名单就得跟着变。商城引入注册中心，由它根据注册信息和心跳自动维护可用实例名单。',
    body: '今晚开售前，商品服务器 01 和 02 启动，各自登记服务名、IP 和端口。网关按服务名 product 查询，就能找到这两台实例的地址，这就是服务发现。',
    Visual: Registration
  },
  {
    id: 'heartbeat', map: 'offline', chapter: 5, label: '健康检测',
    title: '用心跳检测实例是否在线',
    lead: '健康检测会定期检查服务实例是否可用，帮助网关避开失效的实例。本例中，每台商品服务器默认每秒向注册中心发送一次心跳，注册中心据此判断实例是否在线。',
    body: '第 1 秒，商品服务器 02 掉线，注册中心只收到 01 的心跳。此时还没到剔除时限，网关仍按原来的地址列表轮询。默认设置下，发往 02 的 3 笔查询都因连接失败而返回 HTTP 503。',
    Visual: Heartbeat
  },
  {
    id: 'expiry', map: 'evicted', chapter: 5, label: '心跳超时',
    title: '注册中心什么时候移除 02 的地址？',
    lead: '实例注册时，注册中心开始计时，每收到一次心跳就重新计时。02 在第 0 秒注册后没有再上报。默认时限为 2 秒，因此注册中心在第 2 秒移除 02 的地址，并通知网关更新本地列表。',
    body: '如果商品查询刚发往 02 就遇到断连或响应超时，网关可能还没收到结果。这是只读的 GET 请求，只要还没向顾客返回数据，网关就可以按策略改发 01。本例最多重试一次，再失败就返回 503。',
    Visual: Expiry
  },
  {
    id: 'lookup', map: 'restored', chapter: 6, label: '查询与订阅',
    title: '商品服务器 02 重新上线后，网关如何更新实例列表？',
    lead: '网关启动时，按服务名 product 向注册中心查询实例地址，将列表保存在本地，并订阅这个服务的地址变更。',
    body: '第 8 秒，商品服务器 02 重新上线并注册。注册中心将 02 的地址加入实例列表，再把新列表推送给网关。网关收到后，便轮流向 01 和 02 转发商品查询。',
    Visual: Lookup, live: true
  },
  {
    id: 'routing', map: 'join', chapter: 6, label: '多实例上线',
    title: '启动多个商品服务器',
    lead: '试着手动添加商品服务器。01 和 02 已在线，点击下方的“启动商品服务器 03”，再依次启动 04、05 和 06。',
    body: '新服务器注册后，网关会更新地址列表，轮流向各实例转发查询。同样是每秒 6 笔查询，两台在线时每台接 3 笔，六台在线时每台接 1 笔。',
    Visual: ServerLaunches, live: true
  }
];

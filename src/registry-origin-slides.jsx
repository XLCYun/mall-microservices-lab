function Upstream({service, ids}) {
  const backends = ids.map(id => '    server ' + service.endpoint(id) + ';').join('\n');
  return <>{'upstream ' + service.name + ' {\n'}<em>{backends}</em>{'\n}'}</>;
}

function SingleMachine({service}) {
  return (
    <div className="origin-single">
      <ol className="origin-single-route" role="list" aria-label="商品查询的转发顺序">
        {['商城客户端', 'NGINX 网关', '商品服务器 01'].map(label => (
          <li key={label}><span className="origin-single-device" aria-hidden="true" />{label}</li>
        ))}
      </ol>
      <div className="origin-single-conf">
        <strong>nginx.conf</strong>
        <pre><code><Upstream service={service} ids={[1]} /></code></pre>
      </div>
    </div>
  );
}

function StaticUpstream({service}) {
  const proxy = `server {
    listen 80;
    location /products/ {
        proxy_pass http://${service.name};
    }
}`;
  return (
    <div className="origin-conf">
      <div className="origin-conf-header">
        <strong>nginx.conf</strong><span>http 块内的配置</span>
      </div>
      <pre><code><Upstream service={service} ids={[1, 2]} />{'\n\n' + proxy}</code></pre>
    </div>
  );
}

const fleetChange = [
  {when: '高峰前', id: 3, edit: '写入 03', change: 'added', receiving: '01、02、03'},
  {when: '流量回落后', id: 2, edit: '移除 02', change: 'removed', receiving: '01、03'}
];

function ElasticFleet({service}) {
  return (
    <div className="origin-fleet">
      <table>
        <caption>两次重载，名单怎样变？</caption>
        <thead>
          <tr><th scope="col">时机</th><th scope="col">NGINX 配置变更</th><th scope="col">重载后接单</th></tr>
        </thead>
        <tbody>
          {fleetChange.map(({when, id, edit, change, receiving}) => (
            <tr key={id}>
              <th scope="row">{when}</th>
              <td><span className="origin-fleet-status" data-change={change}>{edit}</span><code>{service.endpoint(id)}</code></td>
              <td>{receiving}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const originSlides = [
  {
    id: 'single', map: 'single', chapter: 1, label: '低流量', title: '单实例模式',
    lead: '这是一家网上商城。',
    body: '上线初期访问量很低，商品服务器 01 一台就够了。NGINX 只配置了它的 IP 和端口，所有商品查询都发给它，暂时用不上服务发现。',
    Visual: SingleMachine
  },
  {
    id: 'nginx', map: 'nginx', chapter: 2, label: '固定双机', title: '两台机器轮流接单',
    lead: '访问量上来后，01 一台机器忙不过来。值班同学加上商品服务器 02，把第二个地址写进原来的 NGINX 配置。',
    body: '两个地址权重相同，NGINX 按顺序轮流转发。把下方地图的流量调到每秒 1 笔，逐秒看下一笔轮到谁。',
    Visual: StaticUpstream
  },
  {
    id: 'elastic', map: 'elastic', chapter: 3, label: '弹性伸缩', title: '大促扩容，低峰缩容',
    lead: '上次大促，两台服务器扛不住高峰流量，商城损失了大量订单。团队计划用微服务按需扩缩容，高峰时加机器，低峰时节省成本。',
    body: '先在下方用原来的 NGINX 固定名单演练一次。',
    steps: [
      '预计流量上涨时，启动商品服务器 03。',
      '把 03 的 IP 写入 NGINX 并重载，让三台服务器分担请求。',
      '流量回落时，把每秒请求数调到 4。移除 02 的 IP 并重载，确认它不再接单，再下线 02。'
    ],
    Visual: ElasticFleet
  }
];

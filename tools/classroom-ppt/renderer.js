async ({scene,def}) => {
  const lab=window.Lab, api=lab.scenes[scene], free=def.id==='free'||def.id==='stage';
  const base=api.init();base.time=0;
  const record=free?null:lab.guides.create(scene,base).records.find(x=>x.id===def.id);
  if(!free&&!record)throw Error(scene+' / '+def.id);
  let clock=def.start??record.keySecond, lastWall=0, cueNo=-1;
  const run=record?.createRun(clock), W=1152,H=600, isTesting=scene==='phone'||scene==='contract', HMAP=isTesting?246:540;
  const map=document.createElement('canvas');
  map.style.cssText='position:fixed;left:0;top:0;width:1152px;height:'+HMAP+'px;z-index:800000;pointer-events:none';
  document.body.append(map);
  const video=document.createElement('canvas');video.width=W;video.height=H;
  const ctx=video.getContext('2d',{alpha:false}), ctxApp={current:()=>true, notify:()=>{},refresh:()=>{}};
  let seen,flights=[],summary=[],previousSec=-1;
  async function advance() {
    if(run){run.advanceTo(clock);return;}
    while(base.time<Math.floor(clock+1e-7)){base.time++;await api.tick(base);}
  }
  function status(f) {
    if(f.state){
      const s=f.state,w=s.window, r=s.spaces?.prod;
      if(scene==='gateway'){
        if(def.id==='routes')return 'HTTP '+s.probeStatus;
        if(def.id==='aggregate')return '客户端 '+s.page.calls.length+' 次   后端 '+s.page.reads.length+' 次';
        if(def.id==='balance')return '01 接单 '+w.hits[0]+' 笔   02 接单 '+w.hits[1]+' 笔';
        return '放行 '+w.passed+' 笔   拦截 '+w.blocked+' 笔';
      }
      if(scene==='scale')return '流量 '+w.incoming+' QPS   就绪 '+w.ready+' / '+s.desired+' 台';
      if(scene==='resilience'){
        if(def.id==='retry')return '入口 '+s.retry.frame.entrance+' 笔   评论调用 '+s.retry.frame.review+' 次';
        if(def.id==='timeout')return 'HTTP '+r.last.status+'   响应 '+r.last.rt+' ms';
        if(def.id==='breaker')return '查评论 '+r.frame.calls+' 次   熔断跳过 '+r.frame.circuit+' 笔';
        return '查询 '+r.frame.requests+' 笔   评论调用 '+r.frame.calls+' 次';
      }
      if(scene==='mesh')return 'v1 接单 '+s.frame.v1+' 笔   v2 接单 '+s.frame.v2+' 笔';
    }
    if(run&&scene==='registry')return '成功 '+f.success+' 笔   失败 '+f.failed+' 笔';
    return api.stats(base).slice(0,2).map(([k,n,u])=>k+' '+n+' '+u).join('   ');
  }
  function testingResults() {
    const x=34,top=HMAP+10;
    ctx.fillStyle='#222238';ctx.fillRect(0,HMAP,W,540-HMAP);
    const word=(s,x,y,font=18,color='#f6f3fb',bold=false)=>{
      ctx.font=(bold?'600 ':'400 ')+font+'px "PingFang SC",sans-serif';
      ctx.textBaseline='middle';ctx.textAlign='left';ctx.fillStyle=color;ctx.fillText(String(s),x,y);
    };
    const rule=y=>{ctx.fillStyle='#45425a';ctx.fillRect(31,y,W-62,1);};
    const label='#c1b9d9',green='#92e2bf',red='#ffad9d',amber='#f9c77d';
    if(scene==='phone'){
      const rows=base.rows;
      word('手机号格式校验',x,top+17,22,'#ffffff',true);
      const [a,b,c]=api.stats(base);
      word('已运行 '+a[1]+' / '+rows.length+' 条     通过 '+b[1]+' 条',710,top+17,18,green,true);
      const cols=[37,287,610,790,985];
      ['用例','输入 phone','预期','实际 valid','断言'].forEach((t,i)=>word(t,cols[i],top+54,16,label,true));
      rule(top+72);
      rows.forEach((row,i)=>{
        const yy=top+94+i*35, done=Boolean(row.exchange),pass=done&&row.actual===row.expected&&!row.error;
        if(done&&row.id===base.selectedId){ctx.fillStyle='#38334c';ctx.fillRect(31,yy-16,W-62,33);}
        word(String(i+1).padStart(2,'0')+'   '+row.name,cols[0],yy,18);
        word(JSON.stringify(row.phone),cols[1],yy,18);
        word(String(row.expected),cols[2],yy,18,label);
        word(done?String(row.actual):'—',cols[3],yy,18,done?'#eeeaf8':label);
        word(done?(pass?'通过':'不符'):'待运行',cols[4],yy,18,done?(pass?green:red):label,done);
      });
    }else{
      const display=c=>c?.status==='pass'?'通过':c?.status==='fail'?'失败':c?.status==='invalid'?'契约有误':c?.status==='blocked'?'未执行':'待验证';
      const verdictColor=c=>c?.status==='pass'?green:c?.status==='fail'?red:label;
      const current=api.versions.find(([v])=>v===base.version)[1].split(' · ')[0];
      word('库存接口验证',x,top+17,22,'#ffffff',true);
      word(current,218,top+17,19,amber,true);
      const cols=[36,238,377,523];
      ['调用方','测试桩','契约重放','实际接入'].forEach((t,i)=>word(t,cols[i],top+64,16,label,true));
      ctx.fillStyle='#45425a';ctx.fillRect(32,top+83,630,1);ctx.fillRect(684,top+41,1,196);
      ['order','product'].forEach((id,i)=>{
        const yy=top+118+i*55,v=[base.consumerChecks[id],base.providerChecks[id],base.liveChecks[id]];
        word(api.roles[id].name,cols[0],yy,20,'#eeeaf8',true);
        v.forEach((c,j)=>word(j===2?(c?.status==='pass'?'可用':c?.status==='fail'?'受影响':display(c)):display(c),cols[j+1],yy,18,verdictColor(c)));
      });
      word('库存接口响应',720,top+59,17,label,true);
      const resp=api.responsePreview(base).actual;
      word('HTTP '+resp.status,720,top+95,18,'#f6f3fb',true);
      const entries=Object.entries(resp.body);
      entries.forEach(([key,v],i)=>word(key+'  '+JSON.stringify(v),720,top+127+i*30,18,key==='quantity'?amber:'#e7e2ef'));
    }
  }

  window.__recordStep=async (wall,wantPoster)=>{
    clock+=(wall-lastWall)*def.speed;lastWall=wall;await advance();
    while(cueNo+1<def.cues.length && wall+1e-7>=def.cues[cueNo+1][0]){
      cueNo++;
      for(const [key,val] of def.cues[cueNo][2]){
        if(run){const t=run.configure(key,val);if(typeof t==='number'&&t>clock)clock=t+.01;}
        else{ctxApp.sceneTime=clock;await api.act(base,key,val,null,ctxApp);}
      }
    }
    const f=run?run.frame():{second:base.time,model:api.stage(base)};
    const batch=f.model.manualBatch;
    if(batch&&batch!==seen){flights.push({batch,at:clock});seen=batch;}
    flights=flights.filter(x=>clock-x.at<lab.requestBalls.batchEnd(x.batch));
    lab.drawStage(map,scene,f.model,clock,flights.map(x=>({batch:x.batch,elapsed:clock-x.at})));
    ctx.drawImage(map,0,0,W,HMAP);
    if(isTesting)testingResults();
    ctx.fillStyle='#18182c';ctx.fillRect(0,540,W,60);
    const subtitle=def.cues[Math.max(cueNo,0)][1],data=status(f);
    ctx.textBaseline='middle';ctx.textAlign='left';ctx.font='600 17px "PingFang SC",sans-serif';ctx.fillStyle='#b8aaf8';
    ctx.fillText('T+'+String(f.second).padStart(2,'0')+' 秒',22,540+30);
    ctx.fillStyle='#ffffff';ctx.font='600 20px "PingFang SC",sans-serif';
    ctx.fillText(subtitle,109,540+30,713);
    ctx.textAlign='right';ctx.fillStyle='#b7eddf';ctx.font='600 16px "PingFang SC",sans-serif';ctx.fillText(data,W-22,540+30,291);
    if(previousSec!==f.second||wantPoster){summary.push({wall,second:f.second,cue:cueNo,stats:data,nodes:f.model.nodes.map(n=>[n.label,n.sub])});previousSec=f.second;}
    window.__recordLog=summary;
    return video.toDataURL(wantPoster?'image/png':'image/jpeg',.93).split(',')[1];
  };
}

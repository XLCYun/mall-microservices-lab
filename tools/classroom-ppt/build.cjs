const fs=require('node:fs'), path=require('node:path'), Pptx=require('pptxgenjs');
const {chapters,boards,body,lead,trimItems,free}=require('./content.cjs');
const ppt=new Pptx(), W=13.3333333,H=7.5, F='Noto Sans SC', M='Courier New', S=ppt.ShapeType;
ppt.layout='LAYOUT_WIDE';ppt.author='高级软件工程课程组';ppt.subject='网上商城微服务治理与测试课堂实验';ppt.title='微服务治理与测试';ppt.lang='zh-CN';ppt.theme={headFontFace:F,bodyFontFace:F,lang:'zh-CN'};
const C={ink:'221E35',muted:'5A566C',line:'DAD7E3',paper:'FBFAFC',white:'FFFFFF',violet:'5D45AF',mint:'197863',dark:'1B1B31',light:'F1EDF8',soft:'E7F4EF',code:'252238',gold:'A35D27'};
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')), all=read('scenes.json'), extra=read('meta/free-extra.json');
const data=Object.fromEntries(Object.keys(chapters).map(k=>[k,read('meta/'+k+'-page.json')]));
const plan=[{kind:'cover'},{kind:'contents'}], ix={},fmt=n=>String(n).padStart(2,'0');
for(const k of Object.keys(chapters)){
 ix[k]=plan.length+1;
 if(free[k]){
  for(const story of data[k].stories){
   plan.push({k,kind:'story',id:story.map,story},{k,kind:'movie',id:story.map,story});
   if(k==='scale'&&story.map==='baseline')plan.push({k,kind:'hpa'});
  }
  plan.push({k,kind:'control'},{k,kind:'movie',id:'free'},{k,kind:'result'});
  if(k==='scale')plan.push({k,kind:'curve'});
  if(k==='mesh')plan.push({k,kind:'istio'});
 } else {
  plan.push({k,kind:'story',id:'intro',story:data[k].stories[0]});
  if(k==='phone')plan.push({k,kind:'movie',id:'stage'},...['phoneCases','phoneWire','phoneCsv','phoneData','phoneScript'].map(kind=>({k,kind})));
  else plan.push(...['contractDocs','contractGuide','contractRun'].map(kind=>({k,kind})),{k,kind:'movie',id:'stage'},...['contractResult','contractResponse','contractMatrix','contractLog'].map(kind=>({k,kind})));
 }
}
const section=k=>chapters[k][0]+' · '+chapters[k][2];
for(const title of ['课程目录',...Object.keys(chapters).map(section)])ppt.addSection({title});
const indexList=[];
function rect(s,x,y,w,h,fill,stroke=fill,lw=0){s.addShape(S.rect,{x,y,w,h,rectRadius:0,line:{color:stroke,width:lw,transparency:lw?0:100},fill:{color:fill},radius:0,objectName:'色块'});}
function line(s,x,y,w,color=C.line,pt=.7){s.addShape(S.line,{x,y,w,h:0,line:{color,width:pt},objectName:'分隔线'});}
function txt(s,t,x,y,w,h,opt={}){
 if(t===undefined||t===null||t==='')return;
 s.addText(String(t),{x,y,w,h,margin:0,breakLine:false,fontFace:F,fontSize:18,color:C.ink,lang:'zh-CN',valign:'middle',paraSpaceAfter:0,paraSpaceBefore:0,wrap:true,isTextBox:true,objectName:opt.objectName||String(t).slice(0,38),...opt});
}
function imageContain(s,p,x,y,w,h){const abs=path.resolve(p);s.addImage({path:abs,...pptxSizing(abs,x,y,w,h),altText:path.basename(p)});}
function pptxSizing(p,x,y,w,h){const b=fs.readFileSync(p),iw=b.readUInt32BE(16),ih=b.readUInt32BE(20),sc=Math.min(w/iw,h/ih);return {x:x+(w-iw*sc)/2,y:y+(h-ih*sc)/2,w:iw*sc,h:ih*sc};}
function foot(s,k,n,dark=false){
 const tone=dark?'BFB8D6':'767083';
 line(s,.55,7.105,12.23,dark?'45425C':C.line,.55);
 txt(s,k?chapters[k][0]+'  /  '+chapters[k][1]+' '+chapters[k][2]:'高级软件工程课程实践',.57,7.15,7,.22,{fontSize:9,color:tone});
 txt(s,'返回目录',10.14,7.14,1.4,.24,{fontSize:9.3,color:dark?'CCC1FF':C.violet,align:'right',hyperlink:{slide:2},underline:false});
 txt(s,fmt(n)+' / '+fmt(plan.length),11.73,7.14,1.03,.24,{fontFace:'Arial',fontSize:10.1,align:'right',color:tone});
}
function header(s,p,n,label,title){s.background={color:C.paper};const k=p.k,m=chapters[k];
 txt(s,m[0]+'  /  '+m[1]+' '+m[2]+'     ·     '+label,.61,.27,12.12,.32,{fontSize:13.2,bold:true,color:k==='phone'||k==='contract'?C.mint:C.violet});
 txt(s,title,.57,.79,12.2,.72,{fontSize:title.length>26?29:33.5,bold:true,objectName:'标题'});
 line(s,.6,1.68,12.13,C.line,.8);foot(s,k,n);
}
function notes(s,t,k){const src=k?'\n\n课程原页  https://xlcyun.github.io/mall-microservices-lab/#'+k:'';s.addNotes((t+src).split('\n'));}
function units(s){let v=0;for(const c of s)v+=c===' '?0.31:c.charCodeAt(0)>255?1:/[ilj1.,'|:!]/.test(c)?.32:/[MW@#%]/.test(c)?.84:.59;return v;}
function lines(t,w,size){const limit=w*72/size*.94,out=[];for(const para of t.split('\n')){
 let l='';for(const token of para.match(/[a-zA-Z0-9][a-zA-Z0-9_./:%=+\-]*|./gu)||[]){
  if(l&&units(l+token)>limit&&!/^[，。？！、；：）】”’%]$/.test(token)){out.push(l.trimEnd());l=token.trimStart();}else l+=token;
 }out.push(l.trimEnd());
}return out;}
function textFlow(s,blocks,x,y,w,maxH){
 const config=[{big:20,small:16.8},{big:18.6,small:16},{big:17.4,small:15},{big:16.4,small:14.4},{big:15.6,small:13.6}];
 let layout;
 for(const {big,small} of config){
  const bs=blocks.filter(b=>b.t).map((b,i)=>{const bullet=b.type==='bullet',sz=b.type==='lead'?big:small,bw=w-(bullet?.23:0),ll=lines(b.t,bw,sz),spacing=sz*1.39;
   return {...b,sz,bw,ll,bullet,spacing,h:ll.length*spacing/72+.035,gap:i===0?.26:(bullet?.15:.21)};});const total=bs.reduce((a,b)=>a+b.h+b.gap,0)-(bs[0]?.gap||0);
  layout={bs,total};if(total<=maxH)break;
 }
 if(layout.total>maxH+.05)throw Error('Teaching copy exceeds layout '+blocks[0].t+' h='+layout.total);
 let yy=y+Math.max(0,Math.min(.33,(maxH-layout.total)/3));
 for(let i=0;i<layout.bs.length;i++){
  const b=layout.bs[i];if(i) yy+=b.gap;
  if(b.bullet)rect(s,x+.025,yy+.12,.065,.065,C.violet);
  txt(s,b.ll.join('\n'),x+(b.bullet?.23:0),yy,b.bw,b.h,{fontSize:b.sz,lineSpacing:b.spacing,valign:'top',bold:b.type==='lead',color:b.type==='lead'?C.ink:C.muted});
  yy+=b.h;
 }
}
function table(s,head,rows,x,y,w,opt={}){
 const widths=Array.isArray(opt.widths)?opt.widths.map(n=>n*w):undefined,size=opt.size||17, rh=opt.rh||.58;
 const make=(row,heading,i)=>row.map((v,j)=>({text:String(v),options:{bold:heading||(opt.firstBold!==false&&j===0),color:heading?'493A68':(opt.status&&j>0&&/受影响|失败|不符/.test(String(v))?'A83C37':opt.status&&j>0&&/通过|可用/.test(String(v))?'136A54':C.ink),fill:{color:heading?'E9E3F3':(i%2===0?'FFFFFF':'F7F6FA')},valign:'middle',align:opt.center&&j>0?'center':'left',fontSize:heading?size-.5:size}}));
 s.addTable([make(head,true,0),...rows.map((r,i)=>make(r,false,i))],{x,y,w,colW:widths,rowH:rh,autoPage:false,border:{type:'solid',color:'DAD6E4',pt:.65},color:C.ink,fontFace:F,fontSize:size,margin:[.08,.10,.08,.10],valign:'middle',paraSpaceAfter:0,objectName:head.join(' / ')});
}
function code(s,t,x,y,w,h,options={}){
 const bg=options.light?'F0EDF6':C.code;rect(s,x,y,w,h,bg);
 if(options.name)txt(s,options.name,x+.25,y+.16,w-.5,.35,{fontFace:M,fontSize:14,bold:true,color:options.light?C.violet:'BDAFF7'});
 const start=options.name?.63:.19,sz=options.size||15;
 txt(s,t,x+.25,y+start,w-.50,h-start-.11,{fontFace:options.font||M,fontSize:sz,color:options.light?C.ink:'F3F0FA',valign:'top',lineSpacing:options.spacing||sz*1.27,wrap:false,objectName:options.name||'示例代码'});
}
function board(s,opt,story,k){
 const x=6.70,y=2.01,w=6.02,h=4.77,tone=['gateway','resilience','phone'].includes(k)?'E9F3EF':'EEEBF6';
 if(opt.image){imageContain(s,opt.image,x,y+.35,w,h-.5);return;}
 if(opt.code){code(s,story.code,x,y+.17,w,4.39,{name:'nginx.conf',size:15.9,spacing:21.0});return;}
 rect(s,x,y,w,h,tone);
 txt(s,opt.title,x+.28,y+.28,w-.56,.55,{fontSize:21.3,bold:true,color:k==='phone'?C.mint:C.ink});
 const tx=x+.26,tw=w-.52,n=opt.rows.length;
 const rh=n>3?.50:.59,sz=opt.cols.length>3?13.75:14.4;
 const specs={
 '注册中心登记表':[.23,.26,.51],'第 8 秒，地址变更已推送':[.15,.425,.425],
 '相同商品地址，两种请求身份':[.30,.40,.30],'同样给 v2 分配 25%':[.28,.28,.44],
 '谁在使用库存接口？':[.26,.36,.38],'每台商品实例独立维护断路器':[.22,.33,.45]
 };
 table(s,opt.cols,opt.rows,tx,y+1.13,tw,{size:sz,rh,widths:specs[opt.title],firstBold:false});
 let hy=y+1.13+(n+1)*rh;
 if(opt.math){txt(s,opt.math,tx+.02,hy+.16,tw-.04,.45,{fontSize:18.5,bold:true,color:C.violet,fontFace:opt.math.includes('===')?M:F});hy+=.51;}
 const bottom=Math.max(y+3.53,hy+.16);
 line(s,tx,bottom,tw,'C9C8D5',.65);txt(s,opt.tail,tx+.02,bottom+.13,tw-.04,y+h-bottom-.24,{fontSize:14.1,color:C.muted,valign:'top'});
}
function storySlide(s,p,n){
 const r=p.story,k=p.k,key=k+'-'+p.id,bb=boards[key];if(!bb)throw Error(key);
 header(s,p,n,r.label.replace(' / ','  ·  '),r.title);
 const bs=[{type:'lead',t:lead[p.id]||r.lead},...(trimItems[key]||r.items).map(t=>({type:'bullet',t})),{type:'body',t:body[p.id]||r.body}];
 textFlow(s,bs,.65,2.04,5.68,4.82);board(s,bb,r,k);
 notes(s,[r.lead,...r.items,r.body,'','课堂图卡',r.board].filter(Boolean).join('\n'),k);return r.title;
}
function movie(s,p,n){
 const k=p.k,key=k+'-'+p.id,d=all[k].find(v=>v.id===p.id),log=read('meta/'+key+'.json'),poster=path.resolve('poster/'+key+'.jpg'),video=path.resolve('clips-limited/'+key+'.mp4');
 s.background={color:C.dark};
 txt(s,chapters[k][0]+'  /  '+chapters[k][1]+' '+chapters[k][2]+'     ·     地图演示',.63,.12,8.3,.27,{fontSize:11.5,bold:true,color:'BEB1E9'});
 txt(s,d.title.replace('自由实验 · ',''),.59,.45,10.35,.5,{fontSize:25.5,bold:true,color:'FFFFFF',objectName:'标题'});
 txt(s,'放映时点击地图播放  ·  '+d.seconds+' 秒',9.87,.19,2.81,.40,{fontSize:11.6,align:'right',color:'DFD9ED'});
 const frame={x:.82,y:1.02,w:11.69,h:11.69*600/1152};
 s.addImage({path:poster,...frame,altText:'实验关键帧，'+d.title});
 s.addMedia({type:'video',path:video,cover:'image/jpeg;base64,'+fs.readFileSync(poster).toString('base64'),...frame,objectName:'播放 '+d.title,altText:d.title});
 foot(s,k,n,true);
 const clockCues=d.cues.map(c=>fmt(Math.floor(c[0]))+' 秒　'+c[1]).join('\n');
 const obs=log.filter((e,i,a)=>i===0||i===a.length-1||a[i-1].stats!==e.stats).map(v=>'T+'+v.second+' 秒　'+v.stats).join('\n');
 notes(s,[d.title,'放映时点击地图即可播放。画面下方显示模拟时钟、操作和当时的实际数值。','',clockCues,'',obs,p.story?'\n网页实验的读数与控制\n'+p.story.panel+'\n'+p.story.settings:''].join('\n'),k);return d.title;
}
function stepList(s,items,x,y,w,dy){
 items.forEach(([name,ex],i)=>{const yy=y+i*dy;txt(s,fmt(i+1),x,yy,.44,.37,{fontFace:'Arial',fontSize:16,bold:true,color:C.violet});
 txt(s,name,x+.55,yy-.04,w-.57,.42,{fontSize:19.0,bold:true});
 txt(s,ex,x+.55,yy+.44,w-.62,dy-.52,{fontSize:15.5,color:C.muted,valign:'top'});});
}
function freeControl(s,p,n){
 const k=p.k,f=free[k];header(s,p,n,'自由实验  ·  场景控制',f.controlTitle);
 stepList(s,f.steps,.66,2.13,6.10,1.48);
 rect(s,7.1,2.02,5.57,4.76,'F1EEF7');
 txt(s,'可调参数',7.38,2.28,4.98,.48,{fontSize:21.4,bold:true});
 f.knobs.forEach(([h,v],i)=>{const y=2.98+i*.85;line(s,7.4,y,4.98,'D7D1E4');txt(s,h,7.40,y+.10,4.86,.28,{fontSize:13.8,bold:true,color:C.violet});txt(s,v,7.40,y+.40,4.94,.32,{fontSize:14.0});});
 notes(s,[data[k].free.mission,'',...f.steps.map(z=>z.join('　')),'','网页场景控制',data[k].free.controls,extra[k].controls,extra[k].inline].join('\n'),k);return f.controlTitle;
}
function metric(s,x,y,w,big,small){
 rect(s,x,y,w,1.07,'E8F2EE');txt(s,big,x+.18,y+.10,w-.36,.48,{fontFace:F,bold:true,fontSize:25.5,color:'155E4D'});txt(s,small,x+.19,y+.67,w-.37,.25,{fontSize:12.3,color:'316958'});
}
function freeResult(s,p,n){
 const k=p.k,f=free[k];header(s,p,n,'自由实验  ·  指标与运行明细',f.resultTitle);
 const metrics=k==='resilience'?[['0 次','本秒评论调用'],['6 笔','本秒跳过评论'],['100%','商品成功率']]:k==='mesh'?[['50 笔','回滚后 v1 收到'],['0 笔','回滚后 v2 收到'],['0 笔','内测请求头命中']]:k==='scale'?[['20','网关放行 QPS'],['20%','平均 CPU'],['2 / 2','就绪 / 期望']]:f.metrics;
 metrics.forEach((m,i)=>metric(s,.67+i*4.08,1.98,3.88,m[0],m[1]));
 table(s,f.heads,f.rows,.69,3.32,11.98,{size:17.0,rh:.57,firstBold:true});
 txt(s,f.result,.73,6.30,11.82,.52,{fontSize:16.7,color:C.muted});
 notes(s,[f.result,'','网页运行明细（初始状态）',extra[k].details,'',data[k].free.metrics].join('\n'),k);return f.resultTitle;
}
function simpleBand(s,t,y=6.3){rect(s,.68,y,11.97,.56,'E7F2ED');txt(s,t,.88,y+.05,11.55,.43,{fontSize:16,bold:true,color:'195E4D'});}
function codeDetail(s,p,n){
 const k=p.k;
 if(p.kind==='hpa'){
  const st=data.scale.stories.find(x=>x.map==='baseline'),title='商品服务的 HPA 配置';
  header(s,p,n,'配置示例  ·  autoscaling/v2',title);
  code(s,st.code,.67,1.91,7.10,4.96,{size:12.7,spacing:15.55});
  stepList(s,[['选择伸缩对象','scaleTargetRef 指向名为 product 的 Deployment。'],['选定指标','CPU 利用率目标为 60%，副本数限定在 2 至 6。'],['限制缩容速度','本演示的缩容稳定窗口为 5 秒。']],8.14,2.18,4.55,1.48);notes(s,st.code+'\n\n'+st.body,k);return title;
 }
 if(p.kind==='curve'){
  const title='一次扩缩容中的 CPU 变化';header(s,p,n,'自由实验  ·  CPU 走势',title);
  const samples=read('meta/scale-free.json'),map=new Map(samples.map(v=>[v.second,Number(v.stats.match(/CPU (\d+) %/)[1])]));
  const labels=[...map.keys()].map(String),vals=[...map.values()];
  s.addChart(ppt.ChartType.line,[{name:'实际 CPU',labels,values:vals},{name:'目标 CPU',labels,values:vals.map(()=>60)}],{x:.64,y:1.98,w:8.25,h:4.76,chartColors:['6550A7','2B9A78'],showLegend:true,legendPos:'b',legendFontFace:F,legendFontSize:13,catAxisLabelFontFace:'Arial',catAxisLabelFontSize:11,valAxisLabelFontSize:11,valAxisMinVal:0,valAxisMaxVal:110,valAxisMajorUnit:20,showTitle:false,showValue:false,showCatName:false,catAxisTitle:'模拟时间（秒）',showCatAxisTitle:true,catAxisTitleFontFace:F,catAxisTitleFontSize:12,showValAxisTitle:true,valAxisTitle:'CPU 利用率（%）',valAxisTitleFontFace:F,valAxisTitleFontSize:12,showMarker:true,markerSize:4,lineSize:2.35,catAxisLineColor:'C8C5D1',valAxisLineColor:'C8C5D1',valGridLine:{color:'E4E1E9',size:.6},showBorder:false,objectName:'实际 CPU 与目标值随时间变化'});
  stepList(s,[['高峰刚到','两台就绪副本达到 100%。'],['扩容完成','四台分担同样的流量，回到 60%。'],['流量回落','先降到 10%。缩至两台后，每台约为 20%。']],9.16,2.22,3.48,1.46);
  notes(s,samples.map(v=>'T+'+v.second+' 秒  '+v.stats).join('\n'),k);return title;
 }
 const title='用 Istio 配置商品版本与流量权重';header(s,p,n,'自由实验  ·  路由配置',title);
 const parts=extra.mesh.code[0].split('\n---\n');
 code(s,parts[0],.66,1.99,6.93,4.92,{name:'VirtualService',size:12.7,spacing:17.1});
 code(s,parts[1],7.79,1.99,4.87,4.92,{name:'DestinationRule',size:12.7,spacing:17.1,light:true});
 notes(s,'这里展示自由实验初始设置。v1 和 v2 的普通流量权重为 90% 与 10%。\n\n'+extra.mesh.code[0],k);return title;
}
function phoneSlide(s,p,n){
 const d=data.phone,k=p.k;
 const names={phoneCases:'五条手机号用例都通过了吗？',phoneWire:'发送一条少一位数字的手机号',phoneCsv:'用 CSV 追加一条边界用例',phoneData:'用例表怎样变成 JSON？',phoneScript:'怎样逐行发请求并核对响应？'};
 const title=names[p.kind];header(s,p,n,'手机号格式校验',title);
 if(p.kind==='phoneCases'){
  txt(s,'校验规则',.71,1.98,1.58,.42,{fontSize:18.0,bold:true,color:C.mint});
  txt(s,'11 位半角数字，首位是 1，第二位是 3–9。空格按原样参与校验。',2.18,1.97,10.42,.45,{fontSize:18});
  const rows=d.rows.map(([num,name,raw,expected])=>[num,name,raw===''?'""':raw,expected==='valid'?'true':'false',expected==='valid'?'true':'false','通过']);
  table(s,['编号','用例','输入 phone','预期','实际 valid','断言'],rows,.72,2.74,11.85,{widths:[.08,.20,.27,.15,.18,.12],rh:.54,size:16.2,firstBold:false,status:true});
  simpleBand(s,'运行全部后，5 条断言都通过了。无效输入返回 false，也符合这些用例的预期。');
  notes(s,'在网页中可编辑名称、手机号、预期值，逐行运行或运行全部。\n\n'+rows.map(v=>v.join('　')).join('\n'),k);
 }else if(p.kind==='phoneWire'){
  txt(s,'用例 02　少一位数字',.72,1.99,11.85,.52,{fontSize:20.5,bold:true});
  code(s,'POST /signup/verify-phone\nContent-Type: application/json\n\n{\n  "phone": "1380000000"\n}',.71,2.80,5.83,2.95,{name:'REQUEST',size:17.0,spacing:22.4});
  code(s,'HTTP 200\nContent-Type: application/json\n\n{\n  "valid": false\n}',6.78,2.80,5.83,2.95,{name:'RESPONSE',size:17.0,spacing:22.4,light:true});
  simpleBand(s,'预期 false     实际 false     断言通过');notes(s,'手机号是字符串，保留所有原始字符。请求体只传 phone。接口收到合法 JSON 后返回格式判断，测试程序在本地将 valid 与 expected 作严格相等比较。',k);
 }else if(p.kind==='phoneCsv'){
  stepList(s,[['保留原始输入','把手机号列按文本处理。空格和前导零都属于测试数据。'],['追加到用例表','CSV 至少包含“输入原文”和“预期校验结果”。导入后追加到表尾。'],['运行并导出','可单独发送选中的用例，也可运行全部。导出文件包含实际结果和断言结果。']],.72,2.12,6.25,1.49);
  rect(s,7.15,2.05,5.48,4.62,'EBF3EE');txt(s,'CSV 示例',7.44,2.41,4.86,.55,{fontSize:23,bold:true,color:C.mint});
  txt(s,'用例,输入原文,预期校验结果\n首位为 0,03800000000,无效\n尾部空格,"13800000000 ",无效',7.44,3.31,4.86,1.33,{fontSize:16.4,lineSpacing:24.7,valign:'top'});
  line(s,7.44,5.02,4.8);txt(s,'网页也可以新增、删除所选行，或从边界用例列表加入一行。',7.44,5.25,4.84,.85,{fontSize:16.1,color:C.muted,valign:'top'});notes(s,'把输入当作字符串，确保 CSV 软件没有删除前导零或尾部空格。课堂上可先问学生预期，再运行新增的那一行。',k);
 }else if(p.kind==='phoneData'){
  code(s,d.code[0],.70,2.09,8.19,4.47,{name:'cases.json',size:15.1,spacing:24.0});
  stepList(s,[['phone','保留输入原文的字符串。'],['expected','每行预期的布尔值。'],['一行一次验证','数组的每个对象对应测试用例表里的一行。']],9.19,2.30,3.49,1.37);
  notes(s,'网页中编辑手机号或预期会同步更新这段 JSON。空字符串保留为 ""。\n\n'+d.code[0],k);
 }else{
  const js=d.code[1].replace('verifyPhone(new Request(url, options))','fetch(url, options)');
  code(s,js,.70,1.96,8.63,4.99,{name:'verify-cases.js',size:14.1,spacing:20.0});
  stepList(s,[['取一行','按顺序读取 phone 和 expected。'],['发请求','请求体里只放 phone。'],['比结果','HTTP 请求成功，并且 valid 与 expected 相等，这条断言才通过。']],9.57,2.15,3.10,1.53);
  notes(s,'代码展示网页通过 HTTP 访问接口时的路径。离线 HTML 使用同一校验函数构造 Request 并读取 Response，输入、返回值和断言相同。\n\n'+js,k);
 }
 return title;
}
function contractSlide(s,p,n){
 const d=data.contract,k=p.k;
 const titles={contractDocs:'订单和商品分别约定了什么？',contractGuide:'怎样读一份库存接口契约？',contractRun:'验证库存接口的兼容性',contractResult:'字段改名，哪一个调用方受影响？',contractResponse:'接口仍返回 200，订单为什么失败？',contractMatrix:'对照五种库存接口实现',contractLog:'从逐项记录定位失败的约定'};
 const title=titles[p.kind];header(s,p,n,'库存接口契约',title);
 if(p.kind==='contractDocs'){
  code(s,d.yaml[0],.68,1.90,5.92,5.05,{name:'order.yml',size:12.4,spacing:14.18});
  code(s,d.yaml[1],6.76,1.90,5.89,5.05,{name:'product.yml',size:12.4,spacing:14.18,light:true});
  notes(s,'完整展示两个默认展开的 YAML。请求相同，响应依赖不同。\n\n订单服务\n'+d.yaml[0]+'\n\n商品服务\n'+d.yaml[1],k);
 }else if(p.kind==='contractGuide'){
  stepList(s,[['request','约定方法、路径、请求头和请求体。示例 SKU-042 有 12 件库存，SKU-007 库存为 0。'],['response','约定状态码、Content-Type 和所需的响应字段。测试桩用这里的示例作答。'],['matchers','by_type 核对类型，by_regex 匹配整个字符串。其余约定字段按值比较。']],.71,2.03,6.55,1.49);
  rect(s,7.51,2.05,5.10,4.60,'EFECF7');txt(s,'两份契约的边界',7.80,2.38,4.50,.56,{fontSize:21,bold:true});
  table(s,['字段','匹配规则'],[['sku','SKU-[0-9]{3}'],['stock','number'],['available','boolean']],7.80,3.18,4.5,{size:15.1,rh:.53,firstBold:false});
  txt(s,'响应允许携带契约以外的额外字段。',7.84,5.68,4.43,.55,{fontSize:15.6,color:C.muted});
  notes(s,d.syntax,k);
 }else if(p.kind==='contractRun'){
  txt(s,'先用原始实现跑通，再把 stock 改名为 quantity，比较同一份契约在两个版本上的结果。',.73,2.00,11.86,.75,{fontSize:20.9,bold:true});
  const steps=[['读取两份契约','解析订单和商品服务的请求、响应与匹配规则。'],['用测试桩检查调用代码','让调用代码读取约定的示例响应，检查能否正确处理。'],['核对库存接口响应','重放契约请求，用实际响应验证状态、字段与类型，再比较实际接入。']];
  steps.forEach(([h,v],i)=>{const x=.72+i*4.08;rect(s,x,3.13,3.86,2.73,i===2?'E5F0EB':'F0EDF6');txt(s,fmt(i+1),x+.25,3.39,3.3,.38,{fontFace:'Arial',fontSize:18,color:C.violet,bold:true});txt(s,h,x+.24,4.05,3.38,.50,{fontSize:17.8,bold:true});txt(s,v,x+.25,4.79,3.34,.83,{fontSize:14.6,valign:'top',color:C.muted});});
  simpleBand(s,'一次运行验证可以完成三步，也可以逐步执行，单独核对调用代码或库存响应。');
  notes(s,'实验中的五个实现版本为原始实现、字段改名、新增字段、类型变化和状态码变化。留意测试桩验证调用代码，而重放验证库存服务的真实响应。',k);
 }else if(p.kind==='contractResult'){
  txt(s,'本轮把 stock 改名为 quantity，available 仍返回布尔值。',.72,2.08,11.91,.62,{fontSize:21,bold:true});
  table(s,['消费者','依赖字段','测试桩','契约重放','实际接入'],[['订单服务','stock','通过','失败','受影响'],['商品服务','available','通过','通过','可用']],.72,3.12,11.86,{size:19.1,rh:.76,status:true,widths:[.2,.22,.17,.19,.22]});
  simpleBand(s,'库存接口自测 3/3 通过。订单服务仍会因为读取不到 stock 而受影响。');
  notes(s,d.result.join('\n')+'\n\n'+d.log.join('\n'),k);
 }else if(p.kind==='contractResponse'){
  txt(s,'相同请求',.73,1.98,1.85,.5,{fontSize:17.5,bold:true,color:C.mint});txt(s,'POST /inventory/check     {"sku":"SKU-042"}',2.37,1.97,10.12,.52,{fontFace:M,fontSize:18.2});
  const before=JSON.stringify({sku:'SKU-042',stock:12,available:true},null,2);
  code(s,before,.71,2.83,5.80,2.75,{name:'HTTP 200  /  original',size:18.4,spacing:23.2});
  code(s,d.response,6.77,2.83,5.83,2.75,{name:'HTTP 200  /  rename',size:18.4,spacing:23.2,light:true});
  simpleBand(s,'订单约定的是 body.stock。数值仍为 12，但改名后订单代码读不到它。');notes(s,d.response+'\n\n'+d.log[0]+'\n'+d.log[1],k);
 }else if(p.kind==='contractMatrix'){
  const changes=['保留 stock 和 available','stock 改名 quantity','增加 warehouse','stock 变为字符串','HTTP 200 改为 202'];
  const rows=d.matrix.map((r,i)=>[r[0],changes[i],r[1].split('\n').at(-1),r[2].split('\n').at(-1)]);
  table(s,['实现版本','接口改动','订单服务','商品服务'],rows,.72,2.09,11.86,{size:17.2,rh:.62,widths:[.20,.39,.205,.205],status:true});
  simpleBand(s,'新增字段兼容现有约定。字段改名、类型变化和状态码变化的影响，取决于调用方的约定。');
  notes(s,'五个版本均在原网页运行同样两份契约。\n\n'+rows.map(r=>r.join('　')).join('\n'),k);
 }else{
  const rows=d.log.map(e=>{const v=e.split('\n');return [v[0],v[2],v.slice(3).join(' ')];});
  table(s,['检查项','结果','记录'],rows,.73,1.98,11.84,{size:15.3,rh:.55,widths:[.30,.13,.57],status:true});
  notes(s,d.log.join('\n\n'),k);
 }
 return title;
}
function cover(s){
 s.background={color:C.dark};
 rect(s,0,0,.16,7.50,'9B89DA');
 txt(s,'高级软件工程课程实践',.72,.56,7,.43,{fontSize:15.2,color:'CAC0E9',bold:true});
 txt(s,'微服务治理\n与微服务测试',.68,1.58,6.56,2.00,{fontSize:45.5,bold:true,color:'FFFFFF',lineSpacing:64,valign:'top',objectName:'标题'});
 txt(s,'网上商城的七个课堂实验',.73,4.15,6.15,.58,{fontSize:22.5,bold:true,color:'CCBEF1'});
 txt(s,'从服务发现、弹性扩容和灰度发布，到手机号校验与库存接口的契约验证。',.75,4.94,5.8,.90,{fontSize:17.8,color:'D5D2E0',valign:'top'});
 const p=path.resolve('poster/registry-join-map.jpg');s.addImage({path:p,x:6.77,y:2.10,w:6.06,h:6.06*540/1152,altText:'商城网关、注册中心与六台商品服务实例'});
 line(s,.75,6.55,11.88,'45435E',.75);
 txt(s,'进入课程目录  →',.75,6.75,5.18,.38,{fontSize:14.4,bold:true,color:'DED6FA',hyperlink:{slide:2},underline:false});
 txt(s,'课堂备用演示',9.93,6.74,2.68,.4,{fontSize:13.2,align:'right',color:'C0BACD'});
 notes(s,'这份课件可独立放映。情景卡之后是对应的地图录像，放映时点击画面可播放，再次点击可暂停。每段录像同时保留实际运行的关键帧。请翻至目录选择章节。');return '微服务治理与测试';
}
function contents(s,n){
 s.background={color:C.paper};txt(s,'高级软件工程课程实践',.65,.36,9,.35,{fontSize:14,bold:true,color:C.violet});
 txt(s,'课程目录',.62,.89,12,.76,{fontSize:37,bold:true,objectName:'标题'});
 const sections=[['微服务治理',.68,6.57,['registry','gateway','scale','resilience','mesh']],['微服务测试',7.65,4.96,['phone','contract']]];
 for(const [name,x,w,keys] of sections){
  txt(s,name,x,1.93,w,.53,{fontSize:23.3,bold:true,color:name==='微服务治理'?C.violet:C.mint});
  for(let i=0;i<keys.length;i++){const key=keys[i],c=chapters[key],yy=2.7+i*.77;
   line(s,x,yy-.08,w,C.line);txt(s,c[1],x+.04,yy+.04,.59,.32,{fontFace:'Arial',fontSize:15,color:C.muted,bold:true});
   txt(s,c[2],x+.64,yy-.02,w-1.42,.43,{fontSize:18.9,bold:true,color:C.ink,hyperlink:{slide:ix[key]},underline:false});
   txt(s,'P.'+fmt(ix[key]),x+w-.74,yy,.68,.36,{fontFace:'Arial',align:'right',fontSize:13.6,color:C.violet,hyperlink:{slide:ix[key]},underline:false});
   txt(s,c[3],x+.66,yy+.4,w-.77,.27,{fontSize:11.3,color:C.muted});
  }}
 rect(s,7.67,5.04,4.94,1.52,'E7F1EC');txt(s,'课堂放映',7.92,5.26,4.38,.35,{fontSize:15.1,bold:true,color:C.mint});
 txt(s,'点击章名跳转。遇到地图页，点击画面即可播放内嵌视频。',7.92,5.77,4.37,.65,{fontSize:14.1,color:C.ink,valign:'top'});
 foot(s,null,n);notes(s,'各章入口和页脚“返回目录”均为课件内跳转。可以顺序讲解，也可以按章节选择。');return '课程目录';
}
(async()=>{
 for(let i=0;i<plan.length;i++){const p=plan[i],n=i+1,s=ppt.addSlide({sectionTitle:p.k?section(p.k):'课程目录'});let title;
  if(p.kind==='cover')title=cover(s);
  else if(p.kind==='contents')title=contents(s,n);
  else if(p.kind==='story')title=storySlide(s,p,n);
  else if(p.kind==='movie')title=movie(s,p,n);
  else if(p.kind==='control')title=freeControl(s,p,n);
  else if(p.kind==='result')title=freeResult(s,p,n);
  else if(['hpa','istio','curve'].includes(p.kind))title=codeDetail(s,p,n);
  else if(p.k==='phone')title=phoneSlide(s,p,n);
  else if(p.k==='contract')title=contractSlide(s,p,n);
  else throw Error('Missing '+JSON.stringify(p));
  indexList.push({n,title,chapter:p.k||'contents',kind:p.kind,id:p.id||''});
 }
 fs.writeFileSync('meta/slide-manifest.json',JSON.stringify(indexList,null,1));
 await ppt.writeFile({fileName:'out/base.pptx',compression:true});console.log(indexList.length+' slides, '+indexList.filter(i=>i.kind==='movie').length+' videos');
})().catch(err=>{console.error(err);process.exitCode=1});

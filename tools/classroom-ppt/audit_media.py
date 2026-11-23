from pathlib import Path,PurePosixPath
from lxml import etree as E
from zipfile import ZipFile
from concurrent.futures import ThreadPoolExecutor
from playwright.sync_api import sync_playwright
import base64,hashlib,json,posixpath,re,subprocess
manifest=json.load(open('meta/slide-manifest.json'))
defs=json.load(open('scenes.json'))
ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main','p14':'http://schemas.microsoft.com/office/powerpoint/2010/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
R='{'+ns['r']+'}'
def c14(el):return el.xpath('.//p14:media',namespaces=ns)
expected={(k,d['id']) for k,v in defs.items() for d in v}
assert {(e['chapter'],e['id']) for e in manifest if e['kind']=='movie'} == expected
movies_dir=Path('qa/exported');movies_dir.mkdir(exist_ok=True)
reports=[]; pairs={}
with ZipFile('out/complete.pptx') as z:
    assert z.testzip() is None
    slides=[n for n in z.namelist() if re.fullmatch(r'ppt/slides/slide[0-9]+\.xml',n)]
    assert len(slides)==len(manifest)
    assert len([x for x in z.namelist() if x.endswith('.mp4')])==30
    for row in manifest:
        i=row['n'];p='ppt/slides/slide'+str(i)+'.xml';root=E.fromstring(z.read(p));rels=E.fromstring(z.read('ppt/slides/_rels/slide'+str(i)+'.xml.rels'))
        byid={e.get('Id'):e for e in rels}
        assert all(e.get('TargetMode')!='External' for e in rels)
        notes=E.fromstring(z.read('ppt/notesSlides/notesSlide'+str(i)+'.xml'))
        assert len(notes.xpath('.//a:t/text()',namespaces=ns))>=2
        if i==2:
            nav={posixpath.basename(e.get('Target')) for e in rels if e.get('Type').endswith('/slide')}
            assert set('slide'+str(x)+'.xml' for x in (3,22,33,44,55,67,74))<=nav
        elif i>2:assert any(e.get('Target').endswith('slide2.xml') for e in rels)
        if row['kind']!='movie':assert not c14(root);continue
        key=row['chapter']+'-'+row['id'];pic=root.xpath('.//p:pic[.//p14:media]',namespaces=ns)[0]
        a=byid[c14(pic)[0].get(R+'embed')]; b=byid[pic.xpath('.//a:videoFile',namespaces=ns)[0].get(R+'link')]
        assert a.get('Target')==b.get('Target') and a.get('Type').endswith('/media') and b.get('Type').endswith('/video')
        target=posixpath.normpath(posixpath.join('ppt/slides',a.get('Target')));data=z.read(target)
        assert hashlib.sha256(data).digest()==hashlib.sha256(Path('clips-limited',key+'.mp4').read_bytes()).digest()
        assert len(pic.xpath('.//a:hlinkClick[@action="ppaction://media"]',namespaces=ns))==1
        spid=pic.find('.//p:cNvPr',ns).get('id')
        assert root.find('.//p:video/p:cMediaNode/p:tgtEl/p:spTgt',ns).get('spid')==spid
        for frame in root.xpath('.//p:pic/a:blip|.//p:pic/p:blipFill/a:blip',namespaces=ns):
            f=byid[frame.get(R+'embed')].get('Target')
            assert z.read(posixpath.normpath(posixpath.join('ppt/slides',f)))==Path('poster',key+'.jpg').read_bytes()
        fp=movies_dir/(key+'.mp4');fp.write_bytes(data)
        sec=next(d['seconds'] for d in defs[row['chapter']] if d['id']==row['id'])
        reports.append({'slide':i,'key':key,'file':str(fp),'seconds':sec})
assert len(reports)==30
def decode(e):
    fp=e['file'];stream=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',fp]))['streams']
    assert len(stream)==1
    s=stream[0];assert s['codec_name']=='h264' and s['pix_fmt']=='yuv420p' and (s['width'],s['height'])==(1152,600) and s['avg_frame_rate']=='20/1'
    assert int(s['nb_frames'])==20*e['seconds']
    m=subprocess.check_output(['ffmpeg','-v','error','-xerror','-i',fp,'-vf','fps=2,crop=1152:505:0:0,scale=288:126','-threads','1','-f','framemd5','-']).decode().splitlines()
    e['distinct_map_frames']=len({a.split(',')[-1].strip() for a in m if not a.startswith('#')})
    assert e['distinct_map_frames']>=3,(e['key'],e)
with ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(decode,reports))
with sync_playwright() as pw:
    br=pw.chromium.launch(channel='chrome',args=['--autoplay-policy=no-user-gesture-required']);ctx=br.new_context(offline=True);pg=ctx.new_page();pg.set_content('<html><body></body></html>')
    for e in reports:
        media=base64.b64encode(Path(e['file']).read_bytes()).decode()
        observed=pg.evaluate("""async encoded=>{
         const v=document.createElement('video'), blob=URL.createObjectURL(new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:'video/mp4'}));
         v.muted=true;v.playsInline=true;v.src=blob;document.body.append(v);
         const timeout=setTimeout(()=>v.pause(),9000);
         try{
           return await Promise.race([(async()=>{
             await v.play();
             await new Promise(resolve=>v.requestVideoFrameCallback(()=>v.requestVideoFrameCallback(resolve)));
             const start=v.currentTime;v.pause();const seek=new Promise(r=>v.addEventListener('seeked',r,{once:true}));v.currentTime=v.duration*.66;await seek;
             return [v.videoWidth,v.videoHeight,v.duration,start,v.currentTime];
           })(),new Promise((_,reject)=>setTimeout(()=>reject(Error('offline playback timeout')),8000))]);
         }finally{clearTimeout(timeout);v.pause();v.remove();v.removeAttribute('src');v.load();URL.revokeObjectURL(blob);}
        }""",media)
        assert observed[:3]==[1152,600,e['seconds']] and observed[3]>0 and observed[4]>2,(e['key'],observed)
        e['offline_playback_and_seek']=True
    br.close()
Path('qa/media-audit.json').write_text(json.dumps(reports,ensure_ascii=False,indent=1))
print(len(manifest),'slides;',len(reports),'embedded H.264 videos decoded, played, and sought offline;',sum(z['seconds'] for z in reports),'seconds. All internal links, poster frames and playback targets passed.')

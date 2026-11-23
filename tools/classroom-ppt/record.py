from pathlib import Path
import base64,json,sys,subprocess,traceback,os
from playwright.sync_api import sync_playwright
from scenes import S
R=Path(__file__).resolve().parent
SITE=R.joinpath("classroom.html").as_uri()
FPS=20
def run(ids):
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel='chrome',args=['--disable-renderer-backgrounding','--disable-background-timer-throttling'])
        for scene,defn in ids:
            key=scene+'-'+defn['id']
            mp4=R/'clips'/(key+'.mp4'); log=R/'meta'/(key+'.json')
            if mp4.exists() and log.exists():continue
            pg=browser.new_page(viewport={'width':1300,'height':800},device_scale_factor=1)
            try:
                pg.goto(SITE+'#'+scene,wait_until='load')
                pg.wait_for_function('()=>Boolean(window.Lab?.guides && window.Lab?.drawStage)')
                pg.evaluate((R/'renderer.js').read_text(),{'scene':scene,'def':defn})
                proc=subprocess.Popen(['ffmpeg','-v','error','-y','-f','image2pipe','-vcodec','mjpeg','-framerate',str(FPS),'-i','pipe:0','-an','-c:v','libx264','-profile:v','main','-level','3.1','-preset','veryfast','-crf','21','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart',str(mp4)],stdin=subprocess.PIPE)
                try:
                    for i in range(defn['seconds']*FPS):
                        t=i/FPS
                        data=pg.evaluate('t=>window.__recordStep(t,false)',t);proc.stdin.write(base64.b64decode(data))
                        if i==round(defn['poster']*FPS):
                            data=pg.evaluate('t=>window.__recordStep(t,true)',t);(R/'poster'/(key+'.png')).write_bytes(base64.b64decode(data))
                finally:
                    proc.stdin.close();exitcode=proc.wait()
                assert exitcode==0
                log.write_text(json.dumps(pg.evaluate('window.__recordLog'),ensure_ascii=False))
                print(key,defn['seconds'],'sec',mp4.stat().st_size,flush=True)
            finally:pg.close()
        browser.close()
if __name__=='__main__':
    names=sys.argv[1:]
    run([(scene,d) for scene,items in S.items() for d in items if not names or scene in names or scene+'-'+d['id'] in names])

from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess
def convert(f):
    dest=Path('clips-limited')/f.name
    subprocess.run(['ffmpeg','-v','error','-y','-threads','2','-i',str(f),'-an','-vf','scale=in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p','-c:v','libx264','-threads','2','-profile:v','main','-level:v','3.1','-preset','veryfast','-crf','17','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-movflags','+faststart',str(dest)],check=True)
if __name__=='__main__':
    with ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(convert,sorted(Path('clips').glob('*.mp4'))))
    print(len(list(Path('clips-limited').glob('*.mp4'))),'H.264 4:2:0 limited range')

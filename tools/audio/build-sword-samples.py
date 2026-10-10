"""Split the user-provided eight sword takes, retaining pitch and natural tails."""
import argparse,subprocess,tempfile,json,hashlib
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('source',type=Path)
args=parser.parse_args()
root=Path(__file__).resolve().parents[2]
out=root/'public/audio/sfx/sword';out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
 wav=Path(tmp)/'source.wav'
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(args.source),'-ar','48000','-ac','2','-c:a','pcm_f32le',str(wav)],check=True)
 x,sr=sf.read(wav)
 # Each isolated take occupies one second; trim only near-silence within that slot.
 entries=[];parts=[]
 for i in range(8):
  slot=x[i*sr:(i+1)*sr]
  frame=240
  rms=np.sqrt(np.mean(slot[:len(slot)//frame*frame].reshape(-1,frame,2)**2,axis=(1,2)))
  active=np.flatnonzero(rms>10**(-48/20))
  assert len(active)>0
  a=max(0,int(active[0]*frame)-480);b=min(len(slot),int((active[-1]+1)*frame)+1440)
  clip=slot[a:b].copy()
  fade_in=min(96,len(clip));fade_out=min(480,len(clip))
  clip[:fade_in]*=np.linspace(0,1,fade_in)[:,None];clip[-fade_out:]*=np.linspace(1,0,fade_out)[:,None]
  # Consistent peak headroom with at most 3 dB of lift; preserve take dynamics.
  peak=float(np.max(abs(resample_poly(clip,4,1,axis=0))))
  gain=min(10**(3/20),10**(-3/20)/peak);clip*=gain
  file=out/f'swipe-{i+1:02}.wav';sf.write(file,clip,sr,subtype='PCM_16')
  check,rate=sf.read(file);assert rate==48000 and np.max(abs(resample_poly(check,4,1,axis=0)))<.8
  entries.append(dict(file=file.relative_to(root).as_posix(),sourceStart=i+a/sr,sourceEnd=i+b/sr,duration=len(clip)/sr,gainDb=20*np.log10(gain),peakDb=20*np.log10(np.max(abs(check))),sha256=hashlib.sha256(file.read_bytes()).hexdigest()))
  parts.extend([clip,np.zeros((int(.4*sr),2))])
 receipt=dict(source=args.source.name,sourceSha256=hashlib.sha256(args.source.read_bytes()).hexdigest(),sampleRate=sr,channels=2,processing='Silence trim, 2 ms entry / 10 ms tail fades, peak headroom; no pitch or time changes.',samples=entries)
 (root/'docs/audio/sword-samples.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
 sf.write(root/'.superpowers/sword-samples-preview.wav',np.concatenate(parts),sr,subtype='PCM_16')
 print(json.dumps(entries,indent=2))

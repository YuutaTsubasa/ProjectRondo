"""Build source-faithful stage loops; ffmpeg, numpy/scipy/soundfile required."""
import numpy as np,soundfile as sf,json,hashlib,subprocess
from scipy import signal,ndimage
from pathlib import Path
import argparse
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-dir',type=Path,required=True)
parser.add_argument('--output-dir',type=Path,required=True)
parser.add_argument('--only',choices=['arcade','cathartic','victoire'])
args=parser.parse_args();p=args.output_dir;p.mkdir(parents=True,exist_ok=True)
configs=[dict(name='arcade',title='Arcade-Beat-Palace-Loop',source='Arcade Beat.mp3',a=46.99,b=108.043,harmonic=.72,percussion=.060,bars=32),dict(name='cathartic',title='Cathartic-Release-Course-Loop',source='Cathartic Release.mp3',a=52.5,b=168.61716666666666,harmonic=.90,percussion=.055,bars=64),dict(name='victoire',title='Victoire-Eclatante-Result-Loop',source='Victoire Éclatante.mp3',a=27.55,b=57.004333333333335,harmonic=.92,percussion=.055,bars=16)]
def smooth(v):return .5-.5*np.cos(np.pi*np.clip(v,0,1))
def split(x,center,sr):
 seg=x[center-3*sr:center+7*sr];_,_,z=signal.stft(seg.T,fs=sr,nperseg=4096,noverlap=3584,axis=-1)
 mag=np.sqrt(np.mean(abs(z)**2,axis=0));hm=ndimage.median_filter(mag,size=(1,31));pm=ndimage.median_filter(mag,size=(31,1));mask=hm**2/(hm**2+pm**2+1e-15)
 _,h=signal.istft(z*mask[None,:,:],fs=sr,nperseg=4096,noverlap=3584);h=h.T[:len(seg)];return h,seg-h
def mix(tail,head,w):
 active=(w>.001)&(w<.999);ta=tail[active];he=head[active];rho=float(np.sum(ta*he)/np.sqrt(np.sum(ta*ta)*np.sum(he*he)));w=w[:,None]
 norm=np.sqrt((1-w)**2+w*w+2*max(0,rho)*w*(1-w));return ((1-w)*tail+w*head)/norm,rho
for c in configs:
 if args.only and c['name']!=args.only:continue
 name=c['name'];subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(args.source_dir/c['source']),'-ar','48000','-ac','2','-c:a','pcm_f32le',str(p/f'{name}-source.wav')],check=True);x,sr=sf.read(p/f'{name}-source.wav');a=round(c['a']*sr);b=round(c['b']*sr);hh,hp=split(x,a,sr);th,tp=split(x,b,sr)
 pre=round(c['harmonic']*.5*sr);post=4*sr;sl=slice(3*sr-pre,3*sr+post);t=np.arange(-pre,post)/sr;hh,hp,th,tp=[v[sl] for v in [hh,hp,th,tp]]
 cal=np.abs(t)<c['harmonic']*.5;db=float(np.clip(20*np.log10(np.linalg.norm(th[cal])/np.linalg.norm(hh[cal])),-2,2));hh*=10**((db*(1-smooth(t/4)))/20)[:,None]
 harmonic,rhoh=mix(th,hh,smooth((t+c['harmonic']*.5)/c['harmonic']))
 # Incoming kick remains complete: percussive overlap finishes at the beat, before its attack peak.
 percussion,rhop=mix(tp,hp,smooth((t+c['percussion'])/c['percussion']))
 blend=harmonic+percussion;out=np.concatenate([x[a+post:b-pre],blend]);assert len(out)==b-a
 peak=float(np.max(np.abs(signal.resample_poly(out,4,1,axis=0))));gain=min(1,10**(-1.3/20)/peak);out*=gain
 wav=p/(c['title']+'.wav');ogg=p/(c['title']+'.ogg');sf.write(wav,out,sr,subtype='PCM_24')
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),'-c:a','libvorbis','-q:a','7',str(ogg)],check=True)
 decoded,dsr=sf.read(ogg);assert len(decoded)==len(out) and dsr==sr
 truepeak=float(np.max(np.abs(signal.resample_poly(decoded,4,1,axis=0))));assert truepeak<1
 # Audition two continuous cycles from six seconds before the edited splice.
 # Include the real decoded buffer wrap without inserting separators or fades.
 center=len(out)-post;start=(center-6*sr)%len(out)
 preview=decoded[(np.arange(2*len(out))+start)%len(out)]
 sf.write(p/(c['title']+'-Seam-Audition.wav'),preview,sr,subtype='PCM_24')
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(p/(c['title']+'-Seam-Audition.wav')),'-c:a','libmp3lame','-q:a','2',str(p/(c['title']+'-Seam-Audition.mp3'))],check=True)
 jump=np.max(np.abs(decoded[0]-decoded[-1]));local=np.diff(np.concatenate([decoded[-1000:],decoded[:1000]]),axis=0)
 report=dict(revision=1,source=c['source'],source_sha256=hashlib.sha256((args.source_dir/c['source']).read_bytes()).hexdigest(),sample_rate=sr,channels=2,samples=len(out),decoded_samples=len(decoded),duration_seconds=len(out)/sr,source_alignment_seconds=[a/sr,b/sr],estimated_bars=c['bars'],estimated_average_bpm=c['bars']*4*60/(len(out)/sr),harmonic_crossfade_seconds=c['harmonic'],percussive_crossfade_seconds=c['percussion'],incoming_harmonic_gain_db=db,gain_release_seconds=4,global_gain_db=float(20*np.log10(gain)),harmonic_correlation=rhoh,percussive_correlation=rhop,decoded_true_peak_dbfs=float(20*np.log10(truepeak)),decoded_endpoint_step=float(jump),decoded_local_step_p99=float(np.quantile(abs(local),.99)),audition_seconds=len(preview)/sr,audition_join_positions_seconds=[6,6+len(out)/sr],audition_file_wrap_positions_seconds=[10,10+len(out)/sr],edit_note='Shared stereo HPSS mask only around splice; beat-aligned short percussion overlap; sustained harmonic bridge. No time stretch or global loudness reduction unless peak headroom demands it. Estimated bars are inferred from repetition, not a score. Audition plays two continuous cycles starting six seconds before the edited splice, including the real decoded file wrap. No separator silence or fades are inserted.',playback='Loop complete decoded OGG buffer; no runtime crossfade.',listening_status='Signal analysis verified; subjective listening not available in this tool environment.')
 (p/f'{name}-loop-recipe.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2))

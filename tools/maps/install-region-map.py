"""Install the PNG + JSON exported by bake-region.html; no image manipulation."""
import argparse, hashlib, json, math, struct
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('png',type=Path)
parser.add_argument('metadata',type=Path)
args=parser.parse_args()
data=args.png.read_bytes();meta=json.loads(args.metadata.read_text(encoding='utf-8'))
if data[:8]!=b'\x89PNG\r\n\x1a\n':raise SystemExit('Expected a PNG export')
size=struct.unpack('>II',data[16:24])
if size!=(1024,1024) or meta.get('size')!=1024:raise SystemExit('Expected a 1024 x 1024 capture')
b=meta['bounds']
if not all(isinstance(b.get(k),(float,int)) and math.isfinite(b[k]) for k in ('minX','maxX','minZ','maxZ')):raise SystemExit('Invalid bounds')
if b['maxX']<=b['minX'] or abs((b['maxX']-b['minX'])-(b['maxZ']-b['minZ']))>0.001:raise SystemExit('Atlas must have square world pixels')
if meta.get('orientation')!='north:+Z,east:+X':raise SystemExit('Unexpected orientation')
root=Path(__file__).resolve().parents[2]
output=root/'public/maps/white-tide-atlas.png';output.parent.mkdir(exist_ok=True)
receipt={k:meta[k] for k in ('size','bounds','generatedAt','orientation','source')}
receipt['image']='/maps/white-tide-atlas.png';receipt['sha256']=hashlib.sha256(data).hexdigest()
output.write_bytes(data)
(root/'src/content/regionAtlas.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
print(f'Installed {size[0]} x {size[1]} atlas ({len(data)} bytes), SHA-256 {receipt["sha256"][:12]}')

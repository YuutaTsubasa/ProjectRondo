"""Blender --background --factory-startup --python tools/town/import.py -- <zip-directory>.
Import user-supplied Tripo exports without altering source ZIPs or repairing topology.
"""
import bpy, hashlib, json, sys, tempfile, zipfile
from pathlib import Path
repo=Path(__file__).resolve().parents[2]
source_dir=Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else Path.home()/'Downloads'
output=repo/'public'/'town';output.mkdir(exist_ok=True)
workspace=(repo/'.superpowers'/'town-import').resolve();workspace.mkdir(parents=True,exist_ok=True)
tempfile.tempdir=str(workspace)
# An optional asset kind imports only that new revision; other outputs/receipts stay untouched.
selected=sys.argv[sys.argv.index('--')+2] if '--' in sys.argv and len(sys.argv)>sys.argv.index('--')+2 else None
sources=[('house','classical+building+3d+model.zip'),('shop','ornate+building+3d+model.zip'),('tower','architectural+tower+3d+model (1).zip'),('gate','arch+gateway+3d+model.zip'),('arcade','classical+arch+3d+model.zip')]
if selected is not None and selected not in dict(sources):raise ValueError('Unknown asset kind '+selected)
receipt=output/'source-receipt.json'
assets=json.loads(receipt.read_text(encoding='utf-8-sig'))['assets'] if selected and receipt.exists() else []
for kind,filename in sources:
    if selected and selected!=kind:continue
    source=source_dir/filename
    with tempfile.TemporaryDirectory(dir=workspace) as unpacked:
        inputs=Path(unpacked)
        with zipfile.ZipFile(source) as archive:
            for entry in archive.infolist():
                if not (inputs/entry.filename).resolve().is_relative_to(inputs.resolve()):raise ValueError('Unsafe ZIP entry')
            archive.extractall(inputs)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.fbx(filepath=str(next(inputs.glob('*.fbx'))))
        triangles=sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in bpy.context.scene.objects if obj.type=='MESH')
        for image in bpy.data.images:
            if image.source!='FILE':continue
            found=list(inputs.rglob(Path(image.filepath.replace('\\','/')).name))
            if not found:raise ValueError('Missing texture '+image.name)
            image.filepath=str(found[0]);image.reload()
            width,height=image.size
            if max(width,height)>2048:
                ratio=2048/max(width,height);image.scale(round(width*ratio),round(height*ratio))
            image.pack()
        target=output/(kind+'.glb')
        bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_image_format='AUTO',export_yup=True)
        assets=[asset for asset in assets if asset['kind']!=kind]
        assets.append({'kind':kind,'file':target.name,'sourceFile':filename,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'triangles':triangles,'textureMaxSize':2048,'geometryRepaired':False})
(output/'source-receipt.json').write_text(json.dumps({'generator':'Blender FBX import and glTF export; see tools/town/import.py','assets':assets},indent=2)+'\n',encoding='utf8')

"""Hash all non-dependency files before retirement and verify an actual restic restore."""
import hashlib
import json
import os
from pathlib import Path
import sys

mode, manifest_file = sys.argv[1:3]
manifest_path = Path(manifest_file)

def digest(file):
    h = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

if mode == 'manifest':
    targets = json.loads(Path(sys.argv[3]).read_text(encoding='utf-8-sig'))
    files = []
    total = 0
    for target in targets:
        for base, dirs, names in os.walk(target):
            dirs[:] = [d for d in dirs if d != 'node_modules']
            for name in names:
                file = Path(base) / name
                if file.is_symlink() or file.is_junction():
                    raise RuntimeError('Linked file not permitted')
                files.append({'path': str(file.resolve()), 'bytes': file.stat().st_size,
                              'sha256': digest(file)})
                total += file.stat().st_size
    manifest_path.write_text(json.dumps({'targets': targets, 'files': files,
                                        'bytes': total}, indent=2), encoding='utf-8')
    print(json.dumps({'files': len(files), 'bytes': total}))
elif mode == 'verify':
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    restored = Path(sys.argv[3])
    for entry in manifest['files']:
        original = Path(entry['path'])
        # restic Windows restore layout: TARGET/E/AI_town/...
        copy = restored / original.drive.rstrip(':\\/') / Path(*original.parts[1:])
        if digest(original) != entry['sha256'] or digest(copy) != entry['sha256']:
            raise RuntimeError('Source changed or restored file hash mismatch: ' + str(original))
    print(json.dumps({'verified': True, 'files': len(manifest['files']), 'bytes': manifest['bytes']}))
else:
    raise RuntimeError('Unknown verification mode')

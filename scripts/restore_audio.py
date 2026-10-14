"""Restore unchanged original audio from repository ZIP parts (Python standard library)."""
from pathlib import Path
import hashlib
import json
import tempfile
import zipfile

root = Path(__file__).resolve().parent.parent
assets = root / 'audio-assets'
manifest = json.loads((assets / 'manifest.json').read_text())
with tempfile.TemporaryFile() as archive:
    digest = hashlib.sha256()
    for name in manifest['parts']:
        chunk = (assets / name).read_bytes()
        digest.update(chunk)
        archive.write(chunk)
    if digest.hexdigest() != manifest['sha256']:
        raise SystemExit('Audio package checksum mismatch; restore the complete audio-assets folder.')
    archive.seek(0)
    with zipfile.ZipFile(archive) as bundle:
        for info in bundle.infolist():
            target = (root / info.filename).resolve()
            if not target.is_relative_to((root / 'public' / 'audio').resolve()):
                raise SystemExit('Unexpected audio package path.')
            if target.exists() and target.stat().st_size == info.file_size:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(bundle.read(info))
print('Vokawa original audio files ready.')

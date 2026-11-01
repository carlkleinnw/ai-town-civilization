"""Verify ZIP64 snapshot CRCs and exact current state before permitting deletion."""
import json, zipfile, sys, struct, base64
from pathlib import Path
snapshot, world_id, expected_file = sys.argv[1:4]
def normalize(v):
    if isinstance(v,dict):
        if set(v)=={'$float'}:return ('float',base64.b64decode(v['$float'])[::-1].hex())
        if set(v)=={'$integer'}:return ('int64',struct.unpack('<q',base64.b64decode(v['$integer']))[0])
        if set(v)=={'$bytes'}:return ('bytes',v['$bytes'])
        return tuple((k,normalize(x)) for k,x in sorted(v.items()))
    if isinstance(v,list):return tuple(map(normalize,v))
    if isinstance(v,bool):return ('bool',v)
    if isinstance(v,(int,float)):return ('float',struct.pack('>d',float(v)).hex())
    return (type(v).__name__,v)
with zipfile.ZipFile(snapshot) as archive:
    if archive.testzip() is not None:raise RuntimeError('恢复快照 CRC 校验失败')
    def rows(name):
        info=archive.getinfo(name+'/documents.jsonl')
        if info.file_size>512*1024*1024:raise RuntimeError('快照状态文件超出安全核查大小，请先进行离线维护')
        return list(map(json.loads,archive.read(info).splitlines()))
    world=next((r for r in rows('civilizationWorlds') if r['_id']==world_id),None)
    if world is None:raise RuntimeError('恢复快照缺少待删除世界')
    state=dict(world['state'])
    if world.get('storageVersion')==1:
        parts={r['key']:r['data'] for r in rows('civilizationStateParts') if r['worldId']==world_id}
        manifest=state.pop('_parts')
        for field,count in manifest.items():state[field]=[v for i in range(int(count)) for v in parts[field+':'+str(i)]]
    expected=json.loads(Path(expected_file).read_text(encoding='utf-8'))
    if normalize(state)!=normalize(expected):raise RuntimeError('快照完整状态核对失败；本次不会删除')
print(json.dumps({'worldStateExact':True,'zipCRCVerified':True,'ZIP64Supported':True}))

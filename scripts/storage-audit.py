"""Read-only audit of a STOPPED or restored SQLite copy; never run against the live database."""
import sqlite3, json, sys, pathlib, base64, struct, gzip, hashlib
file = pathlib.Path(sys.argv[1]).resolve()
if str(file).lower().startswith(str(pathlib.Path('.convex').resolve()).lower()):
    raise RuntimeError('Use an offline recovery copy, not the live database')
db = sqlite3.connect(file.as_uri() + '?mode=ro', uri=True)
db.execute('pragma query_only=on')
report = {'checkedAt': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(), 'source':str(file),'quickCheck':db.execute('pragma quick_check').fetchone()[0]}
for name in ['page_size','page_count','freelist_count']:
    report[name] = db.execute('pragma '+name).fetchone()[0]
report['databaseBytes'] = file.stat().st_size
report['technicalDocumentVersions'] = db.execute('select count(*) from documents').fetchone()[0]
latest_states = '''select d.deleted,count(*),sum(length(d.json_value)) from documents d join
 (select table_id,id,max(ts) ts from documents group by table_id,id) l
 on d.table_id=l.table_id and d.id=l.id and d.ts=l.ts group by d.deleted'''
latest = {deleted: {'documents':count,'jsonCharacters':chars or 0} for deleted,count,chars in db.execute(latest_states)}
report['latestDocumentStates']=latest
report['obsoleteTechnicalDocumentVersions']=report['technicalDocumentVersions']-sum(v['documents'] for v in latest.values())
metadata = db.execute("select table_id from documents where json_extract(json_value,'$.name')='civilizationWorlds' limit 1").fetchone()[0]
query = '''select d.id,d.json_value from documents d join
 (select id,max(ts) ts from documents where table_id=? group by id) l on d.id=l.id and d.ts=l.ts
 where d.table_id=? and d.deleted=0'''
tables = {}
for table_id, raw in list(db.execute(query, (metadata,metadata))):
    value=json.loads(raw)
    if value.get('state')=='active' and not value['name'].startswith('_'):
        tables[value['name']] = [json.loads(raw) for _,raw in db.execute(query,(table_id,table_id))]
report['tables']={name:{'documents':len(rows),'jsonBytes':sum(len(json.dumps(r,ensure_ascii=False,separators=(',',':')).encode()) for r in rows)} for name,rows in tables.items()}
report['currentBusinessDocuments']=sum(len(v) for v in tables.values())
report['businessTableHashes']={name:hashlib.sha256(json.dumps(sorted(rows,key=lambda r:r['_id']),ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest() for name,rows in tables.items()}
report['technicalVersionsBeyondCurrentBusiness']=report['technicalDocumentVersions']-report['currentBusinessDocuments']
report['retention']={key:json.loads(value) for key,value in db.execute("select key,json_value from persistence_globals where key like '%retention%'")}
keep='mh7fm2xg8twftrfgzsvkk9bfvh8h1wn4'
row=next(r for r in tables['civilizationWorlds'] if r['_id']==keep)
w=dict(row['state'])
if '_parts' in w:
    manifest=w.pop('_parts')
    parts={r['key']:r['data'] for r in tables['civilizationStateParts'] if r['worldId']==keep}
    for field,count in manifest.items():
        w[field]=[value for i in range(int(count)) for value in parts[field+':'+str(i)]]
expected=json.loads(pathlib.Path('.runtime/governance/before-protected.json').read_text(encoding='utf-8'))['state']
def normalize(v):
    if isinstance(v,dict):
        if set(v)=={'$float'}:return ('float',base64.b64decode(v['$float'])[::-1].hex())
        if set(v)=={'$integer'}:return ('int64',struct.unpack('<q',base64.b64decode(v['$integer']))[0])
        return tuple((k,normalize(x)) for k,x in sorted(v.items()))
    if isinstance(v,list):return tuple(map(normalize,v))
    if isinstance(v,bool):return ('bool',v)
    if isinstance(v,(int,float)):return ('float',struct.pack('>d',float(v)).hex())
    return (type(v).__name__,v)
assert normalize(w)==normalize(expected),'Protected state mismatch'
report['protectedStateExact']=True
report['stateSha256']=hashlib.sha256(json.dumps(normalize(w),separators=(',',':')).encode()).hexdigest()
report['readableSaves']=0
for save in tables.get('civilizationSaves',[]):
    if save['worldId']!=keep:continue
    state=save['state']
    if isinstance(state,dict) and state.get('encoding')=='gzip-v1':
        body=base64.b64decode(state['body']['$bytes'])
        decoded=json.loads(gzip.decompress(body))
        assert decoded is not None
    else:
        assert state is not None
    report['readableSaves']+=1
db.close()
output=pathlib.Path(sys.argv[2])
output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k not in ['retention','tables']},ensure_ascii=False))

"""Compare an official snapshot with an offline database, preserving Convex value types."""
from pathlib import Path
import sqlite3,json,zipfile,base64,struct,sys
snapshot,target,output=map(Path,sys.argv[1:4])
def normalize(v):
    if isinstance(v,dict):
        if set(v)=={'$float'}:return ('Float64',base64.b64decode(v['$float'])[::-1].hex())
        if set(v)=={'$integer'}:return ('Int64',struct.unpack('<q',base64.b64decode(v['$integer']))[0])
        if set(v)=={'$bytes'}:return ('Bytes',v['$bytes'])
        return ('Object',tuple((k,normalize(x)) for k,x in sorted(v.items())))
    if isinstance(v,list):return ('Array',tuple(map(normalize,v)))
    if isinstance(v,bool):return ('Boolean',v)
    if isinstance(v,(int,float)):return ('Float64',struct.pack('>d',float(v)).hex())
    return (type(v).__name__,v)
db=sqlite3.connect(target.resolve().as_uri()+'?mode=ro',uri=True)
db.execute('pragma query_only=on')
assert db.execute('pragma quick_check').fetchone()[0]=='ok'
metadata=db.execute("select table_id from documents where json_extract(json_value,'$.name')='civilizationWorlds' limit 1").fetchone()[0]
query='''select d.id,d.json_value from documents d join (select id,max(ts) ts from documents where table_id=? group by id) l
 on d.id=l.id and d.ts=l.ts where d.table_id=? and d.deleted=0'''
tables={}
for table_id,raw in list(db.execute(query,(metadata,metadata))):
    row=json.loads(raw)
    if row.get('state')=='active' and not row['name'].startswith('_'):
        tables[row['name']]={'number':struct.unpack('<q',base64.b64decode(row['number']['$integer']))[0], 'rows':{json.loads(raw)['_id']:json.loads(raw) for _,raw in db.execute(query,(table_id,table_id))}}
count=0
with zipfile.ZipFile(snapshot) as archive:
    ids={r['name']:r['id'] for r in map(json.loads,archive.read('_tables/documents.jsonl').splitlines()) if not r['name'].startswith('_')}
    for name,number in ids.items():
        rows={r['_id']:r for r in map(json.loads,archive.read(name+'/documents.jsonl').splitlines())}
        assert name in tables and tables[name]['number']==number,'Table identity mismatch: '+name
        assert normalize(rows)==normalize(tables[name]['rows']),'Exact typed data mismatch: '+name
        count+=len(rows)
    assert not any(v['rows'] for name,v in tables.items() if name not in ids),'Unexpected populated table'
db.close()
report={'snapshot':str(snapshot.resolve()),'database':str(target.resolve()),'tables':len(ids),'documents':count,'allIDsCreationTimesValuesAndTypesEqual':True,'negativeZeroPreserved':True,'quickCheck':'ok'}
output.write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({'tables':len(ids),'documents':count,'exact':True,'quickCheck':'ok'}))

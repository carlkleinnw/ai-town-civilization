import zipfile,json,sys,re
from pathlib import Path
before,after,output=map(Path,sys.argv[1:4])
changed=0;count=0
with zipfile.ZipFile(before) as old,zipfile.ZipFile(after) as new:
    tables=[r['name'] for r in map(json.loads,old.read('_tables/documents.jsonl').splitlines()) if not r['name'].startswith('_')]
    for table in tables:
        a={r['_id']:r for r in map(json.loads,old.read(table+'/documents.jsonl').splitlines())}
        b={r['_id']:r for r in map(json.loads,new.read(table+'/documents.jsonl').splitlines())}
        if table=='civilizationRecords':
            for r in a.values():r.pop('serial',None)
            for r in b.values():
                serial=int(re.search(r'\d+$',r['key']).group()) if re.search(r'\d+$',r['key']) else 0
                assert r.pop('serial')==serial
                changed+=1
        if table=='civilizationWorlds':
            for r in a.values():r.pop('historyIndexVersion',None)
            for r in b.values():assert r.pop('historyIndexVersion')==1
        assert a==b,'Business history modified: '+table
        count+=len(a)
report={'tables':len(tables),'documents':count,'indexedRecords':changed,'onlyDerivedOrderingMetadataChanged':True,'exactBusinessDataPreserved':True}
output.write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))

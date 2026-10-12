"""Import bibliographic metadata only from the official public catalog JSON.
Usage: python3 scripts/import-cwwl.py /path/to/catalog_data.json
"""
import json,sys,hashlib
from pathlib import Path
raw=json.loads(Path(sys.argv[1]).read_text())
books=[]; duplicates=0; excluded=0
front={'說明','原書說明','序','序言','前言','圖表'}
for era in raw:
 for volume in era['volumes']:
  for book in volume['books']:
   units=[];seen=set()
   for row in book['chapters']:
    key=(row['name'].strip(),str(row['pages']))
    if key in seen: duplicates+=1;continue
    seen.add(key)
    if key[0] in front:excluded+=1;continue
    units.append({'title':key[0],'page':key[1]})
   key=f"{era['era']}|{volume['volume_title']}|{book['book_title']}"
   books.append({'id':'cwwl-'+hashlib.sha256(key.encode()).hexdigest()[:16],'era':era['era'],'volume':volume['volume_title'],'title':book['book_title'],'units':units})
assert len({b['id'] for b in books})==len(books),'Duplicate book identity requires manual review'
metadata={'source':'https://cwwl.twgbr.org/catalog.html','dataSource':'https://cwwl.twgbr.org/catalog_data.json','retrievedOn':'2026-10-12','rawSha256':hashlib.sha256(Path(sys.argv[1]).read_bytes()).hexdigest(),'eraCount':len(raw),'volumeCount':sum(len(e['volumes']) for e in raw),'bookCount':len(books),'rawEntryCount':sum(len(b['chapters']) for e in raw for v in e['volumes'] for b in v['books']),'duplicatesRemoved':duplicates,'frontMatterExcluded':excluded,'readingUnitCount':sum(len(b['units']) for b in books),'excludedExactTitles':sorted(front)}
Path('functions/src/cwwl-data.json').write_text(json.dumps({'metadata':metadata,'books':books},ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps(metadata,ensure_ascii=False,indent=2))

Path('functions/src/cwwl-index.json').write_text(json.dumps([{k:v for k,v in b.items() if k!='units'}|{'count':len(b['units'])} for b in books],ensure_ascii=False,separators=(',',':'))+'\n')

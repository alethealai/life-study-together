"""Import title metadata only; reading links remain in reading-link-catalog.json."""
import json,re,hashlib,tempfile
from pathlib import Path
from html.parser import HTMLParser
from urllib.request import urlopen
from urllib.parse import urljoin
from concurrent.futures import ThreadPoolExecutor
from datetime import date
BASE='https://www.lsmchinese.org/lifestudy/'
class Links(HTMLParser):
 def __init__(self):super().__init__();self.href=None;self.parts=[];self.rows=[]
 def handle_starttag(self,tag,attrs):
  if tag=='a':self.href=dict(attrs).get('href');self.parts=[]
 def handle_data(self,data):
  if self.href:self.parts.append(data)
 def handle_endtag(self,tag):
  if tag=='a' and self.href:self.rows.append((self.href,''.join(self.parts).strip()));self.href=None

def links(url):
 cache=Path(tempfile.gettempdir())/('life-titles-'+hashlib.sha256(url.encode()).hexdigest()+'.html')
 if not cache.exists():cache.write_bytes(urlopen(url,timeout=30).read())
 p=Links();p.feed(cache.read_bytes().decode('utf-8-sig'));return p.rows

def load(row):
 href,name=row;source=urljoin(BASE,href)
 stem=href.rsplit('/',1)[-1].replace('-idx.html','')
 titles=[re.sub(r'^第[^篇]+篇[、\s　]*','',text).strip() for link,text in links(source) if re.fullmatch(r'[0-9]?[A-Za-z]+\d+\.html',link) and (re.match(r'^第[^篇]+篇',text) or link.lower().startswith(stem.lower()))]
 if not titles:raise ValueError('No titles: '+source)
 return name,{'source':source,'titles':titles}

indexes=list(dict.fromkeys((href,name) for href,name in links(BASE) if href.endswith('-idx.html')))
with ThreadPoolExecutor(max_workers=4) as pool:books=dict(pool.map(load,indexes))
catalog=json.loads(Path('lib/reading-link-catalog.json').read_text())
result=[]
for b in catalog['books']:
 name=b['title'].replace('生命讀經','').strip()
 entry=books.get(name)
 if not entry:raise ValueError('Missing book: '+name)
 if len(entry['titles'])!=len(b['paths']):raise ValueError(f"Count mismatch {name}: {len(entry['titles'])} vs {len(b['paths'])}")
 result.append({'bookNumber':b['bookNumber'],**entry})
Path('lib/life-study-titles.json').write_text(json.dumps({'verifiedOn':str(date.today()),'books':result},ensure_ascii=False,indent=2)+'\n')
print(f'Imported {len(result)} book entries; all title counts match reading links.')

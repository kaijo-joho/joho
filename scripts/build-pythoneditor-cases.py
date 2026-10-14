"""私有マスターを使う端末内の実行検証データ。出力先は公開リポジトリ外に限定。"""
import argparse, json, pathlib, textwrap, hashlib
from html.parser import HTMLParser
p=argparse.ArgumentParser();p.add_argument('--rows',required=True);p.add_argument('--out',required=True);p.add_argument('--lessons');p.add_argument('--inputs',required=True)
args=p.parse_args();repo=pathlib.Path(__file__).resolve().parents[1];out=pathlib.Path(args.out).resolve()
if out==repo or repo in out.parents:raise SystemExit('模範解答を含む検証データはリポジトリ外へ保存してください。')
rows=json.loads(pathlib.Path(args.rows).read_text());byid={r[0]:r for r in rows}
inputs=json.loads(pathlib.Path(args.inputs).read_text())
cases=[]
for r in rows:
 config=json.loads(r[16]);source=byid[config['useExistingQuestionCode']] if config.get('useExistingQuestionCode') else r
 code=source[8];stdin=inputs.get(r[0],[])
 if 'input(' in code and not stdin:raise ValueError('検証入力がありません: '+r[0])
 cases.append({'id':r[0],'setId':r[1],'code':code,'setupCode':r[7],'stdin':stdin,'seed':61014,'observation':r[0]!=source[0],
  'expected':config.get('referenceOutputText','') if 'random' not in code else '', 'expectFigure':'plt.' in code})
if args.lessons:
 class Codes(HTMLParser):
  def __init__(self):super().__init__();self.pre=False;self.code='';self.codes=[]
  def handle_starttag(self,t,a):
   if t=='pre':self.pre=True;self.code=''
  def handle_endtag(self,t):
   if t=='pre':self.pre=False;self.codes.append(self.code)
  def handle_data(self,d):
   if self.pre:self.code+=d
 selected={
  'py11':list(range(0,30,2)),
  'py12':list(range(0,28,2))+[28,29,31,33,35,37,39,41,43,45,47,49],
  'py13':list(range(0,42,2)),
  'py34':list(range(2,30,2))+[31],
  'py46':[0,2,4]}
 for name,indexes in selected.items():
  path=pathlib.Path(args.lessons)/(name+'.html');data=path.read_bytes();source=Codes();source.feed(data.decode())
  for i in indexes:
   code=textwrap.dedent(source.codes[i]).strip();setup=''
   if name=='py12' and i>=31:
    setup='a = "apple"\nb = "banana"\nc = "cherry"\nd = "durian"' # 同じ教材の例文29の前提
   expectedError='ZeroDivisionError' if name=='py11' and i==8 else 'KeyError' if name=='py34' and i==4 else ''
   cases.append({'id':f'{name}-example-{i}','setId':name,'code':code,'setupCode':setup,'stdin':['18'] if 'input(' in code else [],'seed':61014,'expectedError':expectedError,'sourceSha256':hashlib.sha256(data).hexdigest(),'publicLesson':True})
out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(cases,ensure_ascii=False)+'\n')
print('Private master cases:',len(rows),'notebooks:',len(set(r[1] for r in rows)),'public lesson cases:',len(cases)-len(rows),'total:',len(cases))

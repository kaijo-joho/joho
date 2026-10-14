import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { studentCatalog } from './pythoneditor-master.mjs';
const root = resolve(fileURLToPath(new URL('../',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.woff2':'font/woff2','.png':'image/png'};
export async function createEditorServer({master,port=0,isolate=true}={}) {
  const catalog=master ? studentCatalog(JSON.parse(await readFile(master,'utf8'))) : null;
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"frame-ancestors 'none'");
    if(isolate){res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');}
    try {
      const host=new URL('http://'+req.headers.host);
      if(!['127.0.0.1','localhost'].includes(host.hostname) || !['GET','HEAD'].includes(req.method) || (req.headers.origin && req.headers.origin!==host.origin) || (req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site']))) {res.writeHead(403);res.end('Forbidden');return;}
      const url=new URL(req.url,host.origin);
      if(url.pathname==='/__pythoneditor/catalog') {
        if(!catalog){res.writeHead(404);res.end('Not Found');return;}
        res.writeHead(200,{'Content-Type':types['.json']});res.end(JSON.stringify(catalog));return;
      }
      let path=decodeURIComponent(url.pathname);
      if(path==='/') {res.writeHead(302,{Location:'/tools/pythoneditor/'});res.end();return;}
      if(path.endsWith('/'))path+='index.html';
      if(!['/tools/pythoneditor/','/tools/shared/','/tools/htmleditor/vendor/'].some(p=>path.startsWith(p))){res.writeHead(404);res.end('Not Found');return;}
      const absolute=await realpath(resolve(root,'.'+path));
      if(!absolute.startsWith(root+sep)) {res.writeHead(403);res.end('Forbidden');return;}
      const data=await readFile(absolute);
      res.writeHead(200,{'Content-Type':types[extname(absolute)]||'text/plain; charset=utf-8'});
      res.end(req.method==='HEAD'?undefined:data);
    } catch {res.writeHead(404);res.end('Not Found');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {server,url:`http://127.0.0.1:${server.address().port}/tools/pythoneditor/`,catalog};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined;};
  const {url}=await createEditorServer({master:arg('--master'),port:Number(arg('--port')||8768),isolate:!process.argv.includes('--no-isolation')});
  console.log(`Pythonエディタ試作: ${url}`);
  console.log('127.0.0.1限定。正本データ・解答のファイルを静的配信しません。本番の認証・GAS接続とは別です。');
}

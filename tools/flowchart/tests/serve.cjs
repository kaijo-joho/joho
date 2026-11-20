/* ブラウザ検査ではアプリと、実際に使う共通部品を同じoriginから配信する。 */
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const app = new Set(['index.html','core.js','render.js','output.js','parts.js','layout.js','transitions.js','editor.js','editor.css','storage.js','local-autosave.js','icon.svg','ui-adapter.js','common-ui.css']);
const shared = new Set(['file-menu.js','file-menu.css','help-panel.js','help-panel.css','ui-icons.js','ui-icons.svg','ui-kit.js','ui-kit.css']);
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
module.exports = async function serve() {
  const root = path.resolve(__dirname,'..');
  const server = http.createServer(async (req,res) => {
    const pathname = new URL(req.url,'http://localhost').pathname;
    const common = pathname.match(/^\/(?:tools\/)?shared\/([^/]+)$/);
    const file = common ? common[1] : pathname.replace(/^\/tools\/flowchart\//,'/').slice(1) || 'index.html';
    if (!(common ? shared : app).has(file)) return res.writeHead(404).end();
    try {
      const raw = await fs.readFile(path.join(root,common ? '../shared' : '',file));
      res.writeHead(200,{'Content-Type':(types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8'}); res.end(raw);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  return {url:'http://127.0.0.1:' + server.address().port + '/',close:() => new Promise(resolve => server.close(resolve))};
};

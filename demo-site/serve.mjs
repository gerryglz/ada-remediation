import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || 4180);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8" };

http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${port}`).pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
    const target = path.resolve(root, relative);
    if (!target.startsWith(root) || ![".html", ".css"].includes(path.extname(target))) throw new Error("Not found");
    const body = await fs.readFile(target);
    res.writeHead(200, { "Content-Type": types[path.extname(target)] });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`Demo site: http://127.0.0.1:${port}`));

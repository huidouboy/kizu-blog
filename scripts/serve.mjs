import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve("public");
const preferredPort = Number.parseInt(process.env.PORT || "4173", 10);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".xml", "application/xml; charset=utf-8"]
]);

function isInsideRoot(filePath) {
  const relative = normalize(filePath).replace(root, "");
  return relative === "" || relative.startsWith(sep);
}

async function resolveFile(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0]).replace(/^\/+/, "");
  const requested = resolve(root, cleanPath);

  if (!isInsideRoot(requested)) {
    return null;
  }

  if (existsSync(requested)) {
    const fileStat = await stat(requested);
    if (fileStat.isDirectory()) {
      const indexPath = join(requested, "index.html");
      return existsSync(indexPath) ? indexPath : null;
    }
    return requested;
  }

  const htmlPath = `${requested}.html`;
  return existsSync(htmlPath) ? htmlPath : null;
}

function listen(port) {
  const server = createServer(async (request, response) => {
    try {
      const filePath = await resolveFile(request.url || "/");
      const finalPath = filePath || join(root, "404", "index.html");

      if (!existsSync(finalPath)) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found. Run `node scripts/build.mjs` first.");
        return;
      }

      response.writeHead(filePath ? 200 : 404, {
        "content-type": mimeTypes.get(extname(finalPath)) || "application/octet-stream"
      });
      createReadStream(finalPath).pipe(response);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  server.once("error", (error) => {
    if (error.code === "EADDRINUSE") {
      listen(port + 1);
      return;
    }
    throw error;
  });

  server.listen(port, () => {
    console.log(`Kizu Blog preview: http://localhost:${port}`);
  });
}

listen(preferredPort);

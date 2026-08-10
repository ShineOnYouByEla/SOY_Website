/* ============================================================
   Statische Dateien von der Platte
   ------------------------------------------------------------
   Ersetzt unter Node das ASSETS-Binding von Cloudflare. app.js
   ruft in beiden Fällen env.ASSETS.fetch(request) auf.
   ============================================================ */

import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * @param {string} directory Wurzelverzeichnis, üblicherweise ./public
 */
export function createAssets(directory) {
  const root = resolve(directory);

  return {
    async fetch(request) {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(request.url).pathname);
      } catch {
        return new Response("Ungültiger Pfad", { status: 400 });
      }

      if (pathname.endsWith("/")) pathname += "index.html";

      // Pfad zusammensetzen und prüfen, dass er das Wurzelverzeichnis nicht
      // verlässt — sonst ließen sich über ../ beliebige Dateien auslesen.
      const target = resolve(join(root, normalize(pathname)));
      if (target !== root && !target.startsWith(root + sep)) {
        return new Response("Nicht gefunden", { status: 404 });
      }

      try {
        const info = await stat(target);
        if (!info.isFile()) return new Response("Nicht gefunden", { status: 404 });

        const body = await readFile(target);
        const type = TYPES[extname(target).toLowerCase()] || "application/octet-stream";

        return new Response(body, {
          headers: {
            "Content-Type": type,
            // Die Oberfläche ändert sich mit jedem Deploy; kurze Frist reicht.
            "Cache-Control": extname(target) === ".html" ? "no-cache" : "public, max-age=300",
            "Last-Modified": info.mtime.toUTCString(),
          },
        });
      } catch {
        return new Response("Nicht gefunden", { status: 404 });
      }
    },
  };
}

import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Sin caché incremental (R2): la app es 100% dinámica y así no hace falta tarjeta en Cloudflare.
export default defineCloudflareConfig({});

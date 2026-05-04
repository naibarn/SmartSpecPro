// Compatibility entrypoint.
//
// The real web server lives in server/_core/index.ts. Keep this file as a
// thin alias so older process managers that still start server/index.ts do not
// accidentally serve only the frontend shell and bypass /trpc routes.
import "./_core/index";

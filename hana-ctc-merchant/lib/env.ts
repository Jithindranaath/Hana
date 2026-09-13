import * as dotenv from "dotenv";
import * as path from "path";

// Next.js already loads this package's own .env/.env.local. This just adds the repo-root .env as
// a fallback for values shared across packages (e.g. CC3_RPC_URL), without overriding anything
// already set.
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env"), override: false });

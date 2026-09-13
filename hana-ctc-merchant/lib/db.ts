import "./env";
import { Db, MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI ?? "mongodb://localhost:27017/hana_ctc";

// Cache the client across Next.js dev hot-reloads (and across route invocations, which each run
// in the same Node process) so we don't open a new connection per request.
declare global {
  // eslint-disable-next-line no-var
  var _hanaMongoClientPromise: Promise<MongoClient> | undefined;
}

function connect(): Promise<MongoClient> {
  return new MongoClient(uri).connect();
}

const clientPromise = global._hanaMongoClientPromise ?? connect();
if (process.env.NODE_ENV !== "production") {
  global._hanaMongoClientPromise = clientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise;
  return client.db(); // database name comes from MONGODB_URI's path
}

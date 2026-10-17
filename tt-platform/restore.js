// Puts a backup back into the database. Run on your own computer (not on Render):
//   npm install
//   MONGODB_URI="your connection string" node restore.js tt-discover-data-2026-10-17.ndjson tt-discover-photos-2026-10-17.ndjson
// It adds or overwrites records by their id. It never deletes anything that is not in the backup.
const fs = require('fs');
const readline = require('readline');
const { MongoClient, BSON } = require('mongodb');

const files = process.argv.slice(2);
if (!process.env.MONGODB_URI || !files.length){
  console.log('Usage: MONGODB_URI="..." node restore.js <backup file> [more backup files]');
  process.exit(1);
}

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('tt_platform');
  const totals = {};
  for (const file of files){
    console.log('Reading', file);
    const batches = {};
    const flush = async name => {
      const ops = batches[name]; if (!ops || !ops.length) return;
      await db.collection(name).bulkWrite(ops, { ordered: false });
      totals[name] = (totals[name] || 0) + ops.length;
      batches[name] = [];
    };
    const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    for await (const line of rl){
      if (!line.trim()) continue;
      const rec = JSON.parse(line);
      const doc = BSON.EJSON.parse(rec.d, { relaxed: false });
      (batches[rec.c] = batches[rec.c] || []).push({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } });
      if (batches[rec.c].length >= 100) await flush(rec.c);
    }
    for (const name of Object.keys(batches)) await flush(name);
  }
  console.log('Restored:', totals);
  await client.close();
})().catch(err => { console.error('Restore failed:', err.message); process.exit(1); });

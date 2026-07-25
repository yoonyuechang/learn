const c = require('@libsql/client');
const db = c.createClient({ url: 'file:dev.db' });
async function main() {
  const r = await db.execute("SELECT id, title FROM News WHERE title LIKE '%결정사%' OR title LIKE '%결혼%' LIMIT 1");
  if (r.rows.length) {
    console.log(r.rows[0].id + ' | ' + r.rows[0].title);
  } else {
    console.log('NOT FOUND');
  }
}
main();

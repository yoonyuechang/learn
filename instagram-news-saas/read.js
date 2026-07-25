const c = require('@libsql/client');
const db = c.createClient({ url: 'file:dev.db' });
async function main() {
  const r = await db.execute('SELECT headline, body FROM Copy ORDER BY createdAt DESC LIMIT 1');
  if (r.rows.length) {
    console.log('HEADLINE: ' + r.rows[0].headline);
    console.log('---');
    console.log('BODY:');
    console.log(r.rows[0].body);
  } else {
    console.log('NO COPY FOUND');
  }
}
main();

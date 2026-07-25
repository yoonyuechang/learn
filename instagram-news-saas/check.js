const{createClient}=require('@libsql/client');
const c=createClient({url:'file:./dev.db'});
async function r(){
  const a=await c.execute("SELECT title, source, LENGTH(content) as clen FROM News");
  console.log('Total:', a.rows.length);
  a.rows.forEach(row=>console.log('['+row.source+'] '+String(row.title).substring(0,55)+' | '+row.clen+' chars'));
}
r();

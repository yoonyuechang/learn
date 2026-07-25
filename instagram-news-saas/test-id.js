const{createClient}=require('@libsql/client');
const c=createClient({url:'file:./dev.db'});
async function r(){
  const a=await c.execute("SELECT id, title FROM News WHERE title LIKE '%로맨스%' LIMIT 1");
  if(a.rows[0]) console.log(a.rows[0].id);
  else console.log('NOT FOUND');
}
r();

const{createClient}=require('@libsql/client');
const c=createClient({url:'file:./dev.db'});

async function run(){
  const r = await c.execute("SELECT id, title FROM News WHERE newsImageUrl IS NOT NULL LIMIT 1");
  const news = r.rows[0];
  console.log('Title:', String(news.title).substring(0, 60));
  
  const res = await fetch('http://localhost:3000/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newsId: news.id })
  });
  const data = await res.json();
  
  if (!data.success) { console.log('FAILED:', JSON.stringify(data).substring(0, 500)); return; }
  
  console.log('Headline:', data.copy.headline);
  console.log('News image:', data.image.hasNewsImage);
  console.log('Hashtags:', data.copy.hashtags.substring(0, 80));
  
  const lines = data.caption.split('\n').filter(l => l.trim().length > 0);
  console.log('\nCaption lines:', lines.length);
  console.log('\n=== Full Caption ===');
  console.log(data.caption);
}
run();

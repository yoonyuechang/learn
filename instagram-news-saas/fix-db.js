const{createClient}=require('@libsql/client');
const c=createClient({url:'file:./dev.db'});

async function run(){
  // 이미지 있고 바이럴 스코어 높은 기사
  const r = await c.execute("SELECT id, title, viralScore FROM News WHERE newsImageUrl IS NOT NULL ORDER BY viralScore DESC NULLS LAST, RANDOM() LIMIT 3");
  
  for (const news of r.rows) {
    console.log('\n=== Generating ===');
    console.log('Title:', String(news.title).substring(0, 50));
    console.log('Score:', news.viralScore || 'not scored');
    
    const res = await fetch('http://localhost:3000/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newsId: news.id })
    });
    const data = await res.json();
    
    if (!data.success) {
      console.log('REJECTED:', data.error ? data.error.substring(0, 80) : 'unknown');
      continue;
    }
    
    console.log('Headline:', data.copy.headline);
    console.log('Score:', data.viralScore);
    console.log('News image:', data.image.hasNewsImage);
    
    const lines = data.caption.split('\n').filter(l => l.trim().length > 0);
    console.log('Caption lines:', lines.length);
    console.log('\n--- Caption Preview ---');
    console.log(data.caption.substring(0, 400));
    console.log('...');
  }
}
run();

fetch('http://localhost:3000/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ newsId: 'd9ff3da3-8fc1-4ad4-9993-10961ce16e85' })
}).then(r=>r.json()).then(d=>{
  console.log('=== HEADLINE ===');
  console.log(d.copy?.headline);
  console.log('=== BODY ===');
  console.log(d.copy?.body);
  console.log('=== HASHTAGS ===');
  console.log(d.copy?.hashtags);
  console.log('=== IMAGE ===');
  console.log(d.image?.imageUrl);
}).catch(e=>console.log('ERR:',e.message))

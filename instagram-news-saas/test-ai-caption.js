const{createClient}=require('@libsql/client');
const c=createClient({url:'file:./dev.db'});

async function run(){
  const r = await c.execute("SELECT id, title, content, newsImageUrl FROM News WHERE newsImageUrl IS NOT NULL AND source='한국경제' LIMIT 1");
  const news = r.rows[0];
  console.log('Title:', String(news.title).substring(0, 60));
  console.log('Image:', String(news.newsImageUrl).substring(0, 80));
  console.log('Content length:', String(news.content).length);
  
  const HfInference = (await import('@huggingface/inference')).HfInference;
  const hf = new HfInference(process.env.HUGGINGFACE_API_KEY || '');
  
  const systemPrompt = `당신은 한국 인스타그램 뉴스 카피라이터입니다.
규칙:
- headline: 20자 이내 강렬한 훅
- body: 최소 20줄 이상. 기승전결 구조:
  1) 기(도입): 뉴스 배경 (3-4줄)
  2) 승(전개): 핵심 내용 상세 (6-8줄)
  3) 전(위기/반전): 논란/갈등 (4-5줄)
  4) 결(결론): 전망 + 질문 (3-4줄)
- 본문 끝: "이 문제, 어떻게 생각하시나요?" + "팔로우하면 하루에 두 번, 똑똑해집니다 🍯"
- hashtags: 8-10개
- JSON만 반환. 마크다운 코드 블록 없이.`;

  const userPrompt = `제목: ${news.title}\n내용: ${String(news.content).substring(0, 800)}\n카테고리: society\n\nJSON: {"headline":"...","body":"20줄 이상 기승전결","hashtags":"#..."}`;

  console.log('\nCalling AI...');
  const result = await hf.chatCompletion({
    model: 'mistralai/Mistral-7B-Instruct-v0.3',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: 1500,
    temperature: 0.8
  });
  const text = result.choices?.[0]?.message?.content || '';
  console.log('\n=== Raw AI Response ===');
  console.log(text);
  
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('\n=== Parsed ===');
      console.log('headline:', parsed.headline);
      console.log('body lines:', parsed.body ? parsed.body.split('\n').filter(l=>l.trim()).length : 0);
      console.log('body preview:', parsed.body ? parsed.body.substring(0, 300) : 'null');
    } catch(e) {
      console.log('\nJSON parse failed:', e.message);
    }
  } else {
    console.log('\nNo JSON found in response');
  }
}
run();

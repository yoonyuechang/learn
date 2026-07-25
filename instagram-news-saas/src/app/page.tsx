'use client'

import { useState, useEffect, useCallback } from 'react'

interface Stats { total: number; analyzed: number; generated: number; posted: number }
interface News {
  id: string; title: string; summary: string; category: string;
  viralScore: number | null; sentiment: string | null; source: string;
  isSelected: boolean; isPosted: boolean
}
interface QueueItem {
  id: string; title: string; summary: string; category: string;
  viralScore: number | null; isPosted: boolean;
  copy: { id: string; headline: string; body: string; hashtags: string } | null
  image: { id: string; imageUrl: string } | null
}
interface Toast { id: number; message: string; type: 'success' | 'error' | 'info' }

let toastId = 0

export default function Home() {
  const [stats, setStats] = useState<Stats>({ total: 0, analyzed: 0, generated: 0, posted: 0 })
  const [news, setNews] = useState<News[]>([])
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [crawling, setCrawling] = useState(false)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [batchGenerating, setBatchGenerating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [tab, setTab] = useState<'news' | 'queue'>('news')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [sortBy, setSortBy] = useState<'crawledAt' | 'viralScore'>('viralScore')

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }, [])

  const loadStats = async () => {
    try { const r = await fetch('/api/crawl'); const d = await r.json(); setStats({ total: d.total||0, analyzed: d.analyzed||0, generated: d.generated||0, posted: d.posted||0 }) } catch {}
  }
  const loadNews = async () => {
    try { const r = await fetch(`/api/news?limit=50&sortBy=${sortBy}`); const d = await r.json(); setNews(d.news||[]) } catch {}
  }
  const loadQueue = async () => {
    try { const r = await fetch('/api/queue'); const d = await r.json(); setQueue(d.items||[]) } catch {}
  }

  useEffect(() => { loadStats(); loadNews(); loadQueue() }, [sortBy])

  const handleCrawl = async () => {
    setCrawling(true)
    try { const r = await fetch('/api/crawl', { method: 'POST' }); const d = await r.json(); loadStats(); loadNews(); addToast(d.message||'크롤링 완료', 'success') }
    catch { addToast('크롤링 실패', 'error') }
    finally { setCrawling(false) }
  }

  const handleGenerate = async (newsId: string, reset = false) => {
    setGeneratingId(newsId)
    try {
      const r = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newsId, reset }) })
      const d = await r.json()
      if (d.success) { loadQueue(); loadStats(); loadNews(); addToast(`생성 완료 — 예측 좋아요 ${d.engagement?.predictedLikes||'?'}`, 'success') }
      else addToast(d.error||'생성 실패', 'error')
    } catch { addToast('생성 실패', 'error') }
    finally { setGeneratingId(null) }
  }

  const handleBatchGenerate = async () => {
    const ungenerated = news.filter(n => !n.isSelected && !n.isPosted).slice(0, 5)
    if (!ungenerated.length) { addToast('생성할 뉴스 없음', 'info'); return }
    setBatchGenerating(true)
    let ok = 0
    for (const item of ungenerated) { try { const r = await fetch('/api/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({newsId:item.id}) }); const d = await r.json(); if(d.success) ok++ } catch {} }
    setBatchGenerating(false); loadStats(); loadNews(); loadQueue(); addToast(`${ok}/${ungenerated.length}건 생성 완료`, 'success')
  }

  const handleMarkPosted = async (newsId: string) => {
    try { await fetch('/api/queue', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({newsId}) }); loadQueue(); loadStats(); addToast('포스팅 완료', 'success') }
    catch { addToast('업데이트 실패', 'error') }
  }

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text); setCopiedId(id); addToast('복사됨', 'success'); setTimeout(() => setCopiedId(null), 2000)
  }

  const catColor: Record<string, string> = { politics:'#E63946', economy:'#457B9D', society:'#2A9D8F', culture:'#E9C46A', tech:'#9B5DE5', sports:'#F4A261', world:'#606C38', general:'#6C757D' }
  const catName: Record<string, string> = { politics:'정치', economy:'경제', society:'사회', culture:'문화', tech:'기술', sports:'스포츠', world:'국제', general:'일반' }

  const viralBadge = (s: number|null) => {
    if (s==null) return null
    const v = Math.round(s)
    const c = v>=70?'text-green-400 bg-green-400/10':v>=40?'text-yellow-400 bg-yellow-400/10':'text-zinc-500 bg-zinc-500/10'
    return <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${c}`}>바이럴 {v}</span>
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-3 rounded-lg text-sm font-medium shadow-lg transition-all duration-300 ${
            t.type==='success'?'bg-green-500/20 text-green-400 border border-green-500/30':
            t.type==='error'?'bg-red-500/20 text-red-400 border border-red-500/30':
            'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          }`}>{t.message}</div>
        ))}
      </div>

      <div className="max-w-[1400px] mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold"><span className="text-[#E63946]">정보바다</span> 뉴스</h1>
            <p className="text-zinc-500 text-sm mt-1">AI 뉴스 콘텐츠 자동 생성 · @jungbobada_news</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCrawl} disabled={crawling}
              className="bg-[#1B2838] hover:bg-[#243447] disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-zinc-800">
              {crawling?'크롤링 중...':'뉴스 크롤링'}
            </button>
            <button onClick={handleBatchGenerate} disabled={batchGenerating||!news.filter(n=>!n.isSelected&&!n.isPosted).length}
              className="bg-[#E63946] hover:bg-[#c62f3b] disabled:opacity-30 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              {batchGenerating?'생성 중...':'일괄 생성'}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[{l:'전체 뉴스',v:stats.total,c:'text-white'},{l:'AI 분석',v:stats.analyzed,c:'text-blue-400'},{l:'콘텐츠 생성',v:stats.generated,c:'text-green-400'},{l:'포스팅',v:stats.posted,c:'text-purple-400'}].map(i=>(
            <div key={i.l} className="bg-[#111118] rounded-xl p-4 border border-zinc-800/50">
              <div className="text-zinc-500 text-xs mb-1">{i.l}</div>
              <div className={`text-2xl font-bold ${i.c}`}>{i.v}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-1 bg-[#111118] rounded-lg p-1 border border-zinc-800/50">
            <button onClick={()=>setTab('news')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab==='news'?'bg-[#1B2838] text-white':'text-zinc-500 hover:text-white'}`}>뉴스 목록 ({news.length})</button>
            <button onClick={()=>setTab('queue')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab==='queue'?'bg-[#1B2838] text-white':'text-zinc-500 hover:text-white'}`}>콘텐츠 큐 ({queue.length})</button>
          </div>
          {tab==='news'&&(
            <div className="flex gap-1 bg-[#111118] rounded-lg p-1 border border-zinc-800/50">
              <button onClick={()=>setSortBy('viralScore')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${sortBy==='viralScore'?'bg-[#1B2838] text-white':'text-zinc-500 hover:text-white'}`}>바이럴순</button>
              <button onClick={()=>setSortBy('crawledAt')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${sortBy==='crawledAt'?'bg-[#1B2838] text-white':'text-zinc-500 hover:text-white'}`}>최신순</button>
            </div>
          )}
        </div>

        {/* Content */}
        {tab==='news' ? (
          <div className="grid grid-cols-1 gap-3">
            {!news.length ? (
              <div className="bg-[#111118] rounded-xl p-12 text-center border border-zinc-800/50"><p className="text-zinc-500">크롤링을 실행하여 뉴스를 수집하세요.</p></div>
            ) : news.map(item => (
              <div key={item.id} className={`bg-[#111118] rounded-xl p-4 border transition-colors ${item.isSelected?'border-green-500/30 bg-green-500/5':'border-zinc-800/50 hover:border-zinc-700/50'}`}>
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded text-xs font-medium" style={{backgroundColor:catColor[item.category]||'#6C757D'}}>{catName[item.category]||item.category}</span>
                      <span className="text-zinc-600 text-xs">{item.source}</span>
                      {viralBadge(item.viralScore)}
                      {item.isSelected&&<span className="text-xs text-green-400">생성됨</span>}
                      {item.isPosted&&<span className="text-xs text-purple-400">완료</span>}
                    </div>
                    <h3 className="font-medium text-sm leading-tight mb-1">{item.title}</h3>
                    <p className="text-zinc-500 text-xs line-clamp-2">{item.summary}</p>
                  </div>
                  <button onClick={()=>handleGenerate(item.id, true)} disabled={generatingId===item.id||item.isPosted}
                    className="shrink-0 bg-[#E63946] hover:bg-[#c62f3b] disabled:opacity-30 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                    {generatingId===item.id?<span className="flex items-center gap-1"><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>생성 중</span>:'콘텐츠 생성'}</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {!queue.length ? (
              <div className="bg-[#111118] rounded-xl p-12 text-center border border-zinc-800/50 col-span-2"><p className="text-zinc-500">생성된 콘텐츠가 없습니다.</p></div>
            ) : queue.map(item => (
              <div key={item.id} className="bg-[#111118] rounded-xl border border-zinc-800/50 overflow-hidden">
                {/* 카드 이미지 미리보기 */}
                {item.image&&(
                  <div className="relative bg-zinc-900">
                    <img src={`${item.image.imageUrl}?t=${Date.now()}`} alt={item.title} className="w-full" loading="lazy"/>
                    <div className="absolute top-3 right-3 flex gap-1">
                      <button onClick={()=>handleGenerate(item.id, true)}
                        className="bg-black/70 hover:bg-black/90 px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-sm transition-colors">
                        다시 생성
                      </button>
                      <button onClick={()=>window.open(`/api/download/${item.image!.id}`,'_blank')}
                        className="bg-black/70 hover:bg-black/90 px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-sm transition-colors">
                        다운로드
                      </button>
                    </div>
                    {item.isPosted&&<div className="absolute top-3 left-3 bg-green-500/90 px-2 py-1 rounded text-xs font-medium backdrop-blur-sm">완료</div>}
                  </div>
                )}

                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{backgroundColor:catColor[item.category]||'#6C757D'}}>{catName[item.category]||item.category}</span>
                    {viralBadge(item.viralScore)}
                  </div>

                  {item.copy&&(
                    <div className="space-y-2">
                      {/* 캡션 복사 — 해시태그 미포함 (해시태그는 첫 댓글에 별도 게시) */}
                      <div className="bg-zinc-900 rounded-lg p-3">
                        <div className="text-xs text-zinc-500 mb-2 flex items-center justify-between">
                          <span>캡션 (본문만 — 해시태그 없음)</span>
                          <button onClick={()=>copyToClipboard(`${item.copy!.headline}\n\n${item.copy!.body}`,'full-'+item.id)}
                            className="text-[#E63946] hover:text-[#ff5a6a] text-xs font-medium transition-colors">
                            {copiedId==='full-'+item.id?'복사됨 ✓':'캡션 복사'}
                          </button>
                        </div>
                        <p className="text-sm font-bold mb-2">{item.copy.headline}</p>
                        <p className="text-xs text-zinc-300 whitespace-pre-line leading-relaxed">{item.copy.body}</p>
                      </div>

                      {/* 해시태그 — 게시 직후 '첫 댓글'로 붙여넣기 (가독성 + 태그 검색 노출 동일) */}
                      <div className="bg-zinc-900 rounded-lg p-3">
                        <div className="text-xs text-zinc-500 mb-1 flex items-center justify-between">
                          <span>해시태그 (첫 댓글용 — 게시 직후 댓글로 붙여넣기)</span>
                          <button onClick={()=>copyToClipboard(item.copy!.hashtags,'tags-'+item.id)}
                            className="text-zinc-400 hover:text-white text-xs transition-colors">
                            {copiedId==='tags-'+item.id?'복사됨':'해시태그 복사'}
                          </button>
                        </div>
                        <p className="text-xs text-blue-400 break-all">{item.copy.hashtags}</p>
                      </div>
                    </div>
                  )}

                  {!item.isPosted&&item.image&&(
                    <button onClick={()=>handleMarkPosted(item.id)}
                      className="w-full mt-3 bg-green-600/20 hover:bg-green-600/30 text-green-400 px-3 py-2 rounded-lg text-xs font-medium transition-colors border border-green-600/20">
                      포스팅 완료
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
import './App.css'
import Tower3D from './Tower3D.jsx'

const founderFloor = [
  { id: 1, author: 'deadbureau', detail: 'First community floor.' },
  { id: 2, author: 'alex.castle', detail: 'SPECIAL FLOOR: a giant loaf of bread and an army of mice.', special: 'bread-mice' },
]
// Only usernames stored in the shared database become floors.
const winners = []
const starterIdeas = []

function App() {
  const [knownFloors, setKnownFloors] = useState(founderFloor)
  const [databaseStatus, setDatabaseStatus] = useState('Connecting to shared tower…')
  const [ideas, setIdeas] = useState(() => {
    try { return (JSON.parse(localStorage.getItem('towerlab-ideas')) || starterIdeas).filter(idea => !String(idea.id).startsWith('demo-')) } catch { return starterIdeas }
  })
  const [floorNumber, setFloorNumber] = useState(1)
  const [jumpValue, setJumpValue] = useState('1')
  const [ideaText, setIdeaText] = useState('')
  const [ideaName, setIdeaName] = useState('')
  const [showIdea, setShowIdea] = useState(false)
  const [showWinners, setShowWinners] = useState(false)
  const [toast, setToast] = useState('')
  const MAX_FLOOR = Math.max(1, ...knownFloors.map(f => f.id))
  const selectedFloor = knownFloors.find(f => f.id === floorNumber)
  const shuffledIdeas = useMemo(() => [...ideas].sort((a, b) => {
    const seedA = Math.sin(Number(String(a.id).replace(/\D/g, '').slice(-6) || a.created || 1) * 12.9898) * 43758.5453
    const seedB = Math.sin(Number(String(b.id).replace(/\D/g, '').slice(-6) || b.created || 1) * 12.9898) * 43758.5453
    return (seedA - Math.floor(seedA)) - (seedB - Math.floor(seedB))
  }), [ideas])

  useEffect(() => { localStorage.setItem('towerlab-ideas', JSON.stringify(ideas)) }, [ideas])

  const loadFloors = useCallback(async () => {
    if (!supabase) { setDatabaseStatus('Supabase not configured — showing the founder floor only.'); return }
    const { data, error } = await supabase.from('tower_floors').select('id, instagram_handle, floor_number, created_at').order('floor_number', { ascending: true })
    if (error) { setDatabaseStatus('Could not load shared floors. Check the Supabase settings.'); console.error('TowerLab floor load failed:', error.message); return }
    const mapped = (data || []).map(row => ({ id: Number(row.floor_number), author: row.instagram_handle, detail: Number(row.floor_number) === 1 ? 'First community floor.' : 'Community follower floor.' }))
    setKnownFloors(mapped.length ? mapped : founderFloor)
    setDatabaseStatus('CONNECTED · SHARED TOWER')
  }, [])

  useEffect(() => {
    queueMicrotask(loadFloors)
    // Polling keeps the tower updated even if Supabase Realtime is not enabled for this table.
    const poll = window.setInterval(loadFloors, 20000)
    let channel
    if (supabase) {
      channel = supabase.channel('tower-floors-live').on('postgres_changes', { event: '*', schema: 'public', table: 'tower_floors' }, loadFloors).subscribe()
    }
    return () => { window.clearInterval(poll); if (channel && supabase) supabase.removeChannel(channel) }
  }, [loadFloors])

  const changeFloor = useCallback((value) => {
    const next = Math.max(1, Math.min(MAX_FLOOR, Math.round(Number(value) || 1)))
    setFloorNumber(next)
    setJumpValue(String(next))
  }, [MAX_FLOOR])
  function handleTowerWheel(event) {
    // The tower owns the scroll gesture: it never scrolls the page.
    event.preventDefault()
    const step = Math.max(1, Math.ceil(Math.abs(event.deltaY) / 65))
    changeFloor(floorNumber + (event.deltaY < 0 ? step : -step))
  }
  function jumpTo(event) {
    event.preventDefault()
    const raw = jumpValue.trim().replace(/^@/, '').toLowerCase()
    const byHandle = knownFloors.find(f => f.author.toLowerCase() === raw)
    if (/^\d+$/.test(raw)) changeFloor(Number(raw))
    else if (byHandle) changeFloor(byHandle.id)
    else setToast('That handle is not linked to a floor yet.')
  }
  function submitIdea(event) {
    event.preventDefault()
    const text = ideaText.trim()
    if (text.length < 4) return
    setIdeas(prev => [{ id: `${Date.now()}`, text, author: ideaName.trim().replace(/^@/, '') || 'anonymous', created: Date.now() }, ...prev])
    setIdeaText('')
    setIdeaName('')
    setShowIdea(false)
    setToast('Idea saved on this browser for now.')
  }

  useEffect(() => {
    const onKey = event => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === 'ArrowUp') { event.preventDefault(); changeFloor(floorNumber + 1) }
      if (event.key === 'ArrowDown') { event.preventDefault(); changeFloor(floorNumber - 1) }
      if (event.key === 'Escape') { setShowIdea(false); setShowWinners(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [floorNumber, changeFloor])

  return <main className="tower-app">
    <header className="tower-header">
      <button className="header-link previous-winners" onClick={() => setShowWinners(true)}>← PREVIOUS WINNERS</button>
      <a className="brand" href="#tower" aria-label="TowerLab home"><span className="brand-mark">T<span>+</span></span><span>TOWER<span className="brand-accent">LAB</span></span></a>
      <button className="header-link add-idea" onClick={() => setShowIdea(true)}>+ ADD YOUR IDEA</button>
    </header>

    <section className="explorer" id="tower">
      <div className="tower-stage">
        <Tower3D floors={knownFloors} selectedFloor={floorNumber} onSelectFloor={changeFloor} onWheel={handleTowerWheel} />
        <div className="stage-caption"><span>THE COMMUNITY TOWER</span><span>FLOOR {floorNumber.toLocaleString()}</span></div>
        <div className="stage-foot"><span>↑ SCROLL TO CLIMB · ↓ TO DESCEND</span><span>↑ / ↓ KEYS ALSO WORK</span></div>
        <div className="database-status" role="status">● {databaseStatus} · {knownFloors.length} FLOOR{knownFloors.length === 1 ? '' : 'S'}</div>
      </div>

      <aside className="travel-panel">
        <div className="panel-heading">TRAVEL TO</div>
        <form onSubmit={jumpTo}>
          <label htmlFor="floor-jump">FLOOR NUMBER OR USERNAME</label>
          <input id="floor-jump" value={jumpValue} onChange={e => setJumpValue(e.target.value)} placeholder="e.g. 1 or @deadbureau" />
          <button className="go-button" type="submit">GO TO FLOOR ↗</button>
        </form>
        <div className="selected-floor">
          <span>CURRENT FLOOR</span><strong>#{floorNumber.toLocaleString()}</strong>
          <b>{selectedFloor ? `@${selectedFloor.author}` : 'Unclaimed floor'}</b>
          <p>{selectedFloor ? selectedFloor.detail : 'A floor appears when a follower is added.'}</p>
          {selectedFloor && <small>FOLLOWER · @{selectedFloor.author}</small>}
        </div>
        {shuffledIdeas.length > 0 && <div className="random-idea"><span>RANDOM IDEA DRAW</span><strong>{shuffledIdeas[0].text}</strong><small>BY @{shuffledIdeas[0].author}</small></div>}
        <div className="panel-help">Scroll over the tower to move. Use the search to jump directly.</div>
      </aside>
    </section>

    {showIdea && <div className="modal-backdrop" onClick={() => setShowIdea(false)}><section className="modal-card" onClick={e => e.stopPropagation()} aria-label="Add your idea">
      <button className="modal-close" onClick={() => setShowIdea(false)} aria-label="Close">×</button>
      <span className="modal-kicker">ADD TO THE BUILD</span><h2>Your idea belongs here.</h2>
      <form onSubmit={submitIdea}>
        <label htmlFor="idea-name">INSTAGRAM HANDLE (OPTIONAL)</label><input id="idea-name" maxLength={24} value={ideaName} onChange={e => setIdeaName(e.target.value)} placeholder="@yourhandle" />
        <label htmlFor="idea-text">YOUR IDEA</label><textarea id="idea-text" maxLength={180} minLength={4} required value={ideaText} onChange={e => setIdeaText(e.target.value)} placeholder="A tiny library for lost robots..." />
        <div className="modal-footer"><span>{ideaText.length}/180</span><button className="go-button" type="submit">SUBMIT IDEA ↗</button></div>
      </form>
      <p className="modal-note">Ideas are saved in this browser for now. The shared database currently stores tower floors only.</p>
    </section></div>}

    {showWinners && <div className="modal-backdrop" onClick={() => setShowWinners(false)}><section className="modal-card winners-card" onClick={e => e.stopPropagation()}>
      <button className="modal-close" onClick={() => setShowWinners(false)} aria-label="Close">×</button><span className="modal-kicker">THE HALL OF FAME</span><h2>Previous winners</h2>
      {winners.map(w => <button className="winner-row" key={w.floor} onClick={() => { changeFloor(w.floor); setShowWinners(false) }}><span>FLOOR {String(w.floor).padStart(2, '0')}</span><strong>{w.title}</strong><small>{w.handle}</small><b>↗</b></button>)}
      <p className="modal-note">No previous winners have been recorded yet.</p>
    </section></div>}
    {toast && <div className="toast-message" role="status">{toast}<button onClick={() => setToast('')}>×</button></div>}
  </main>
}

export default App

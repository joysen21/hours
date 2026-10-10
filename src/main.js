import './style.css'
import { supabase, configured } from './supabase.js'

const $ = s => document.querySelector(s)
const MAX = 10
const MN = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
const COL = ['#0f5f5a','#d08c1e','#3b6fb6','#b5483a','#7a5fa8','#4f9a4a','#c0609a','#6b7b83','#a38a2c','#2a9db5']
const VIEWS = ['load','config','login','reset','erfassen','eintraege','auswertung','kunden']
const APP_VIEWS = ['erfassen','eintraege','auswertung','kunden']

// Lokaler Zustand – gleiche Struktur wie in der ursprünglichen Version:
// customers: [{id,name}], entries: { 'customerId|YYYY-MM-DD': stunden }
let S = { customers: [], entries: {} }
let user = null
let loaded = false
let signUpMode = false
let recovering = /type=recovery/.test(location.hash)

const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10) }
const fmt = n => (+n).toLocaleString('de-DE', { maximumFractionDigits: 2 })
const fmtDate = s => { const [y, m, d] = s.split('-'); return d + '.' + m + '.' + y }
const name = id => (S.customers.find(c => c.id === id) || { name: '(unbekannt)' }).name
function say(el, t, bad) { el.textContent = t; el.className = bad ? 'err' : '' }
const errText = e => {
  const m = (e && (e.message || e.error_description)) || String(e)
  if (/Maximal 10 Kunden/.test(m)) return 'Maximal ' + MAX + ' Kunden.'
  if (/Invalid login credentials/i.test(m)) return 'E-Mail oder Passwort falsch.'
  if (/Email not confirmed/i.test(m)) return 'Bitte bestätige zuerst deine E-Mail-Adresse.'
  if (/User already registered/i.test(m)) return 'Für diese E-Mail gibt es bereits ein Konto.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Keine Verbindung. Bitte später erneut versuchen.'
  return m
}

// ---------------------------------------------------------------- Daten

async function fetchAllEntries() {
  const out = [], page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from('entries')
      .select('customer_id,day,hours').order('day').range(from, from + page - 1)
    if (error) throw error
    out.push(...data)
    if (data.length < page) return out
  }
}

async function loadAll() {
  const [c, e] = await Promise.all([
    supabase.from('customers').select('id,name').order('created_at'),
    fetchAllEntries()
  ])
  if (c.error) throw c.error
  S.customers = c.data
  S.entries = {}
  e.forEach(r => { S.entries[r.customer_id + '|' + r.day] = Number(r.hours) })
  loaded = true
}

// ---------------------------------------------------------------- Navigation

function show(v) {
  VIEWS.forEach(n => { $('#v-' + n).hidden = n !== v })
  $('#nav').hidden = !APP_VIEWS.includes(v)
  document.querySelectorAll('nav button').forEach(b => b.setAttribute('aria-current', b.dataset.v === v))
  if (v === 'erfassen') renderForm()
  if (v === 'eintraege') renderList()
  if (v === 'auswertung') renderStats()
  if (v === 'kunden') renderCust()
  window.scrollTo(0, 0)
}

// ---------------------------------------------------------------- Erfassen

function renderForm() {
  const has = S.customers.length > 0
  $('#noc').hidden = has; $('#form').hidden = !has
  const sel = $('#cs'), cur = sel.value; sel.textContent = ''
  S.customers.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; sel.appendChild(o) })
  if (S.customers.some(c => c.id === cur)) sel.value = cur
  if (!$('#dt').value) $('#dt').value = today()
  loadVal()
}
function loadVal() {
  const k = $('#cs').value + '|' + $('#dt').value, v = S.entries[k]
  $('#hr').value = v === undefined ? '' : v
  say($('#msg'), v === undefined ? '' : 'Bereits erfasst: ' + fmt(v) + ' h. Speichern überschreibt.')
}
function step(d) {
  let v = parseFloat(String($('#hr').value).replace(',', '.')); if (isNaN(v)) v = 0
  $('#hr').value = Math.min(24, Math.max(0, Math.round((v + d) * 4) / 4))
}
async function saveEntry() {
  const raw = String($('#hr').value).replace(',', '.').trim(), c = $('#cs').value, d = $('#dt').value
  if (!c || !d) return say($('#msg'), 'Bitte Kunde und Tag wählen.', 1)
  // Ungültige Eingabe liefert value '' – darf nicht als „leer = löschen“ gelten
  if ($('#hr').validity.badInput) return say($('#msg'), 'Bitte eine Zahl zwischen 0 und 24 eingeben.', 1)
  const v = raw === '' ? 0 : Math.round(parseFloat(raw) * 100) / 100
  if (isNaN(v) || v < 0 || v > 24) return say($('#msg'), 'Bitte eine Zahl zwischen 0 und 24 eingeben.', 1)
  const k = c + '|' + d, btn = $('#sv')
  btn.disabled = true; say($('#msg'), 'Speichert …')
  try {
    const res = v === 0
      ? await supabase.from('entries').delete().eq('customer_id', c).eq('day', d)
      : await supabase.from('entries').upsert({ customer_id: c, day: d, hours: v }, { onConflict: 'customer_id,day' })
    if (res.error) throw res.error
    if (v === 0) delete S.entries[k]; else S.entries[k] = v
    say($('#msg'), v === 0 ? 'Eintrag gelöscht.' : 'Gespeichert: ' + fmt(v) + ' h am ' + fmtDate(d) + ' für ' + name(c) + '.')
  } catch (e) {
    say($('#msg'), 'Nicht gespeichert: ' + errText(e), 1)
  } finally { btn.disabled = false }
}

// ---------------------------------------------------------------- Einträge

function renderList() {
  if (!$('#mo').value) $('#mo').value = today().slice(0, 7)
  const m = $('#mo').value, rows = Object.keys(S.entries).filter(k => k.split('|')[1].startsWith(m))
    .sort((a, b) => b.split('|')[1].localeCompare(a.split('|')[1]) || name(a.split('|')[0]).localeCompare(name(b.split('|')[0])))
  const tot = {}; let all = 0
  rows.forEach(k => { const c = k.split('|')[0]; tot[c] = (tot[c] || 0) + S.entries[k]; all += S.entries[k] })
  const t = $('#tots'); t.textContent = ''
  if (!rows.length) { const p = document.createElement('p'); p.className = 'mut'; p.textContent = 'Keine Einträge in diesem Monat.'; t.appendChild(p) }
  else {
    Object.keys(tot).forEach(c => { const r = document.createElement('div'); r.className = 'tot'; r.innerHTML = '<span></span><b></b>'; r.children[0].textContent = name(c); r.children[1].textContent = fmt(tot[c]) + ' h'; t.appendChild(r) })
    const r = document.createElement('div'); r.className = 'tot all'; r.innerHTML = '<span>Summe</span><b></b>'; r.children[1].textContent = fmt(all) + ' h'; t.appendChild(r)
  }
  const ul = $('#list'); ul.textContent = ''
  rows.forEach(k => {
    const [c, d] = k.split('|'), li = document.createElement('li'), b = document.createElement('button')
    b.className = 'row'; b.innerHTML = '<span></span><b></b>'
    b.children[0].textContent = fmtDate(d) + '  ' + name(c); b.children[1].textContent = fmt(S.entries[k]) + ' h'
    b.onclick = () => { $('#dt').value = d; show('erfassen'); $('#cs').value = c; loadVal() }
    li.appendChild(b); ul.appendChild(li)
  })
}

// ---------------------------------------------------------------- Auswertung

function renderStats() {
  const ys = [...new Set(Object.keys(S.entries).map(k => k.split('|')[1].slice(0, 4)).concat([today().slice(0, 4)]))].sort().reverse()
  const sel = $('#yr'), cur = sel.value; sel.textContent = ''
  ys.forEach(y => { const o = document.createElement('option'); o.value = o.textContent = y; sel.appendChild(o) })
  if (ys.includes(cur)) sel.value = cur
  const y = sel.value, M = Array.from({ length: 12 }, () => ({})), perC = {}; let all = 0
  Object.keys(S.entries).forEach(k => {
    const [c, d] = k.split('|'); if (d.slice(0, 4) !== y) return
    const i = +d.slice(5, 7) - 1, h = S.entries[k]; M[i][c] = (M[i][c] || 0) + h; perC[c] = (perC[c] || 0) + h; all += h
  })
  const tots = M.map(m => Object.values(m).reduce((a, b) => a + b, 0)), max = Math.max(1, ...tots)
  $('#ysum').textContent = all ? fmt(all) + ' Stunden in ' + y : 'Keine Einträge in ' + y + '.'
  const ch = $('#mch'); ch.textContent = ''
  MN.forEach((n, i) => {
    const col = document.createElement('button')
    col.className = 'col'; col.setAttribute('aria-label', n + ' ' + y + ': ' + fmt(tots[i]) + ' Stunden')
    const v = document.createElement('span'); v.className = 'v'; v.textContent = tots[i] ? Math.round(tots[i]) : ''
    const bar = document.createElement('div'); bar.className = 'bar'; bar.style.height = Math.round(tots[i] / max * 140) + 'px'
    S.customers.forEach((c, ci) => { const h = M[i][c.id]; if (!h) return; const s = document.createElement('i'); s.style.flex = h + ' 1 0'; s.style.background = COL[ci % COL.length]; bar.appendChild(s) })
    const l = document.createElement('span'); l.className = 'l'; l.textContent = n
    col.appendChild(v); col.appendChild(bar); col.appendChild(l)
    col.onclick = () => { $('#mo').value = y + '-' + String(i + 1).padStart(2, '0'); show('eintraege') }
    ch.appendChild(col)
  })
  const cb = $('#cbar'); cb.textContent = ''
  const list = S.customers.map((c, ci) => ({ c, ci, h: perC[c.id] || 0 })).filter(x => x.h > 0).sort((a, b) => b.h - a.h)
  if (!list.length) { const p = document.createElement('p'); p.className = 'mut'; p.textContent = 'Keine Daten für ' + y + '.'; cb.appendChild(p) }
  list.forEach(x => {
    const r = document.createElement('div'); r.className = 'cr'
    r.innerHTML = '<div class="t"><span><i class="d"></i><span class="n"></span></span><b></b></div><div class="tr"><i></i></div>'
    r.querySelector('.d').style.background = COL[x.ci % COL.length]
    r.querySelector('.n').textContent = x.c.name; r.querySelector('b').textContent = fmt(x.h) + ' h'
    const f = r.querySelector('.tr i'); f.style.width = (x.h / list[0].h * 100) + '%'; f.style.background = COL[x.ci % COL.length]
    cb.appendChild(r)
  })
}

// ---------------------------------------------------------------- Kunden

function renderCust() {
  $('#cnt').textContent = S.customers.length + ' von ' + MAX + ' Kunden'
  const ul = $('#cl'); ul.textContent = ''
  S.customers.forEach(c => {
    const li = document.createElement('li'), i = document.createElement('input')
    i.type = 'text'; i.value = c.name; i.setAttribute('aria-label', 'Kundenname')
    i.onchange = async () => {
      const v = i.value.trim(); if (!v || v === c.name) { i.value = c.name; return }
      const { error } = await supabase.from('customers').update({ name: v }).eq('id', c.id)
      if (error) { i.value = c.name; return say($('#cmsg'), 'Umbenennen fehlgeschlagen: ' + errText(error), 1) }
      c.name = v; say($('#cmsg'), '')
    }
    li.appendChild(i); ul.appendChild(li)
  })
  $('#na').disabled = S.customers.length >= MAX
  $('#who').textContent = user ? 'Angemeldet als ' + user.email : ''
}
async function addCust() {
  const v = $('#nn').value.trim(), m = $('#cmsg')
  if (!v) return say(m, 'Bitte einen Namen eingeben.', 1)
  if (S.customers.length >= MAX) return say(m, 'Maximal ' + MAX + ' Kunden.', 1)
  $('#na').disabled = true
  const { data, error } = await supabase.from('customers').insert({ name: v }).select('id,name').single()
  if (error) { renderCust(); return say(m, errText(error), 1) }
  S.customers.push(data)
  $('#nn').value = ''; say(m, ''); renderCust()
}

// ---------------------------------------------------------------- Sicherung

function backup() {
  const t = JSON.stringify(S), ta = $('#bk'); ta.value = t
  const ok = () => say($('#bmsg'), 'Sicherung kopiert.')
  const fail = () => { ta.select(); say($('#bmsg'), 'Text markiert. Bitte manuell kopieren.') }
  try { navigator.clipboard.writeText(t).then(ok, fail) } catch (e) { fail() }
}

// Importiert eine Sicherung (auch aus der alten localStorage-Version).
// Kunden werden über den Namen zugeordnet, fehlende werden angelegt.
// Einträge am selben Tag/Kunden werden überschrieben.
async function restore() {
  const m = $('#bmsg')
  let p
  try {
    p = JSON.parse($('#bk').value)
    if (!p || !Array.isArray(p.customers) || !p.entries || typeof p.entries !== 'object') throw 0
  } catch (e) { return say(m, 'Der Text ist keine gültige Sicherung.', 1) }

  const btn = $('#rs'); btn.disabled = true; say(m, 'Importiert …')
  try {
    const idMap = {}
    for (const c of p.customers) {
      const nm = String(c.name || '').trim(); if (!nm) continue
      let hit = S.customers.find(x => x.name.toLowerCase() === nm.toLowerCase())
      if (!hit) {
        if (S.customers.length >= MAX) continue
        const { data, error } = await supabase.from('customers').insert({ name: nm }).select('id,name').single()
        if (error) throw error
        S.customers.push(data); hit = data
      }
      idMap[c.id] = hit.id
    }
    const rows = []
    Object.entries(p.entries).forEach(([k, h]) => {
      const [oc, d] = k.split('|'), cid = idMap[oc], v = Math.round(Number(h) * 100) / 100
      if (cid && /^\d{4}-\d{2}-\d{2}$/.test(d) && v > 0 && v <= 24) rows.push({ customer_id: cid, day: d, hours: v })
    })
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from('entries').upsert(rows.slice(i, i + 500), { onConflict: 'customer_id,day' })
      if (error) throw error
    }
    await loadAll(); renderCust()
    const skipped = p.customers.length - Object.keys(idMap).length
    say(m, 'Importiert: ' + Object.keys(idMap).length + ' Kunden, ' + rows.length + ' Einträge.' + (skipped > 0 ? ' ' + skipped + ' Kunden übersprungen (Limit ' + MAX + ').' : ''))
  } catch (e) {
    say(m, 'Import fehlgeschlagen: ' + errText(e), 1)
  } finally { btn.disabled = false }
}

// ---------------------------------------------------------------- Login

function setLoginMode(up) {
  signUpMode = up
  $('#lb').textContent = up ? 'Konto erstellen' : 'Anmelden'
  $('#ltog').textContent = up ? 'Schon ein Konto? Anmelden' : 'Noch kein Konto? Registrieren'
  $('#lmode').textContent = up ? 'Neues Konto erstellen.' : 'Melde dich an, um deine Stunden zu erfassen.'
  $('#lp').autocomplete = up ? 'new-password' : 'current-password'
  $('#lfgt').hidden = up
  say($('#lmsg'), '')
}
async function submitLogin(ev) {
  ev.preventDefault()
  const email = $('#le').value.trim(), password = $('#lp').value, m = $('#lmsg'), btn = $('#lb')
  btn.disabled = true; say(m, signUpMode ? 'Konto wird erstellt …' : 'Anmeldung …')
  try {
    if (signUpMode) {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } })
      if (error) throw error
      if (!data.session) say(m, 'Fast geschafft: Bitte bestätige deine E-Mail über den Link, den wir dir geschickt haben.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    }
  } catch (e) { say(m, errText(e), 1) } finally { btn.disabled = false }
}
async function forgot() {
  const email = $('#le').value.trim(), m = $('#lmsg')
  if (!email) return say(m, 'Bitte zuerst die E-Mail-Adresse eingeben.', 1)
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin })
  say(m, error ? errText(error) : 'Wenn ein Konto existiert, haben wir dir einen Link zum Zurücksetzen geschickt.', !!error)
}
async function submitReset(ev) {
  ev.preventDefault()
  const { error } = await supabase.auth.updateUser({ password: $('#rp').value })
  if (error) return say($('#rmsg'), errText(error), 1)
  $('#rp').value = ''; recovering = false; await enterApp()
}

async function enterApp() {
  show('load')
  try {
    if (!loaded) await loadAll()
    show(recovering ? 'reset' : 'erfassen')
  } catch (e) {
    show('login'); say($('#lmsg'), 'Daten konnten nicht geladen werden: ' + errText(e), 1)
  }
}

// ---------------------------------------------------------------- Start

function bind() {
  document.querySelectorAll('nav button').forEach(b => b.onclick = () => show(b.dataset.v))
  $('#goc').onclick = () => show('kunden')
  $('#cs').onchange = loadVal; $('#dt').onchange = loadVal
  $('#mi').onclick = () => step(-.5); $('#pl').onclick = () => step(.5)
  $('#sv').onclick = saveEntry; $('#mo').onchange = renderList; $('#yr').onchange = renderStats
  $('#na').onclick = addCust; $('#nn').onkeydown = e => { if (e.key === 'Enter') addCust() }
  $('#cp').onclick = backup; $('#rs').onclick = restore
  $('#lf').onsubmit = submitLogin; $('#ltog').onclick = () => setLoginMode(!signUpMode); $('#lfgt').onclick = forgot
  $('#rf').onsubmit = submitReset
  $('#lo').onclick = () => supabase.auth.signOut()
}

if (!configured) {
  show('config')
} else {
  bind()
  supabase.auth.onAuthStateChange((event, session) => {
    // Supabase empfiehlt, im Callback keine weiteren Supabase-Aufrufe direkt abzuwarten
    setTimeout(() => {
      if (event === 'PASSWORD_RECOVERY') { recovering = true; user = session?.user || null; return show('reset') }
      const nu = session?.user || null
      if (!nu) { user = null; loaded = false; S = { customers: [], entries: {} }; setLoginMode(false); return show('login') }
      const changed = !user || user.id !== nu.id
      user = nu
      // !loaded: nach einem Ladefehler muss eine erneute Anmeldung desselben Benutzers neu laden
      if ((changed || !loaded) && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) { loaded = false; enterApp() }
    }, 0)
  })
}

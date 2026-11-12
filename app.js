// ponytail: static data and hash routing; swap `stories` for fetch('/api/stories') once there is a backend.
// Offline fallback only: shown when every live feed fails.
const samples = [
  { id: "s1", cat: "Formula 1", src: "Sample", date: "2026-10-12", read: 4, featured: true,
    title: "McLaren keep the pressure on in the title fight",
    lede: "Norris and Piastri trade fastest laps as the season heads into its final stretch.",
    body: ["Sample text: replace with live news once the feeds load."] },
  { id: "s2", cat: "Tennis", src: "Sample", date: "2026-10-11", read: 3,
    title: "Sinner eyes the ATP Finals after another straight-sets win",
    lede: "The world number one looks sharp indoors ahead of Turin.",
    body: ["Sample text: replace with live news once the feeds load."] }
];

// Free feeds, converted to JSON (with CORS) by rss2json.com. [sport, source, url]
// Only headline, a short excerpt, image and a link back are shown; full articles stay on the source site.
const feeds = [
  ["Formula 1", "BBC Sport", "https://feeds.bbci.co.uk/sport/formula1/rss.xml"],
  ["Formula 1", "Motorsport.com", "https://www.motorsport.com/rss/f1/news/"],
  ["Formula 1", "Autosport", "https://www.autosport.com/rss/f1/news/"],
  ["Tennis", "BBC Sport", "https://feeds.bbci.co.uk/sport/tennis/rss.xml"],
  ["Tennis", "The Guardian", "https://www.theguardian.com/sport/tennis/rss"]
];

// Pinned picks. `find` is matched against headline + excerpt.
const pins = [
  { sport: "Formula 1", label: "Team", name: "Mercedes", find: "mercedes" },
  { sport: "Formula 1", label: "Driver", name: "Lewis Hamilton", find: "hamilton" },
  { sport: "Tennis", label: "Player", name: "Jannik Sinner", find: "sinner" },
  { sport: "Tennis", label: "Tournament", name: "ATP Finals", find: "atp finals" }
];

const tabs = ["Top", "For you", "Formula 1", "Tennis", "Saved"];
const PAGE = 12;
const intro = {
  Top: ["Every lap. Every set.", "Formula 1 and tennis news from the best publishers, in one calm place."],
  "For you": ["For you.", ""],
  "Formula 1": ["Formula 1.", "Every session, every verdict. Mercedes and Hamilton pinned."],
  Tennis: ["Tennis.", "Tours, tournaments and the stories behind them. Sinner and the ATP Finals pinned."],
  Saved: ["Saved.", "Your bookmarked stories."]
};
const tone = { "Formula 1": ["#1d1d1f", "#e10600"], Tennis: ["#0b3d2e", "#c6e03a"] };
const fallbackTone = ["#1d1d1f", "#6e6e73"];

let stories = [];
const $ = id => document.getElementById(id);
// Filters live in the URL (?cat=&pin=&q=) so a view can be shared and the back button keeps working.
const P = new URLSearchParams(location.search);
const state = { cat: tabs.includes(P.get("cat")) ? P.get("cat") : "Top", q: P.get("q") || "", pin: P.get("pin") || "", shown: PAGE,
                saved: new Set(JSON.parse(localStorage.getItem("saved") || "[]")) };
$("q").value = state.q;
function sync() {
  const p = new URLSearchParams();
  if (state.cat !== "Top") p.set("cat", state.cat);
  if (state.pin) p.set("pin", state.pin);
  if (state.q.trim()) p.set("q", state.q.trim());
  const s = p.toString();
  history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash);
}
const dateFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const fmt = d => dateFmt.format(new Date(d));
// Feed text is untrusted: escape everything that goes into innerHTML.
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const text = html => new DOMParser().parseFromString(html || "", "text/html").body.textContent.replace(/\s+/g, " ").trim();
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);
// Real <img> (lazy below the fold, eager for the hero) so the browser can size, defer and cache it.
const art = (s, first) => {
  const [c1, c2] = tone[s.cat] || fallbackTone;
  const img = s.img && /^https:\/\//.test(s.img)
    ? `<img src="${esc(s.img)}" alt="" width="800" height="600" referrerpolicy="no-referrer" decoding="async" ${first ? 'fetchpriority="high"' : 'loading="lazy"'}>` : "";
  return `<div class="art" style="--c1:${c1};--c2:${c2}">${img}</div>`;
};
const kicker = s => `<span class="kicker"><i class="dot" style="--dot:${(tone[s.cat] || fallbackTone)[1]}"></i>${esc(s.cat)} · ${esc(s.src)}</span>`;
// A broken picture falls back to the flat colour panel instead of a broken-image icon.
addEventListener("error", e => { if (e.target.matches?.(".art img")) e.target.remove(); }, true);

async function loadFeed([cat, src, url]) {
  const key = "feed:" + url, cached = JSON.parse(localStorage.getItem(key) || "null");
  if (cached && Date.now() - cached.t < 10 * 60e3) return cached.items;
  const r = await fetch("https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(url));
  const d = await r.json();
  if (d.status !== "ok") throw new Error(d.message);
  const items = d.items.slice(0, 12).map(i => ({
    id: hash(i.guid || i.link), cat, src, date: i.pubDate.replace(" ", "T") + "Z", link: i.link,
    img: i.thumbnail || i.enclosure?.link || "",
    title: text(i.title), lede: text(i.description).slice(0, 220), body: []
  })).filter(s => s.title && s.link);
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), items })); } catch {}
  return items;
}

async function load() {
  const results = await Promise.allSettled(feeds.map(loadFeed));
  const seen = new Set();
  const live = results.flatMap(r => r.status === "fulfilled" ? r.value : [])
    .filter(s => !seen.has(s.id) && seen.add(s.id))
    .sort((a, b) => b.date.localeCompare(a.date));
  stories = live.length ? live : samples;
  route();
}

const heart = `<svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M5 2h10v16l-5-4-5 4z"/></svg>`;

function save(id) {
  state.saved.has(id) ? state.saved.delete(id) : state.saved.add(id);
  localStorage.setItem("saved", JSON.stringify([...state.saved]));
}

function visible() {
  const q = state.q.trim().toLowerCase();
  return stories.filter(s =>
    (state.cat === "Top" || (state.cat === "Saved" ? state.saved.has(s.id) : state.cat === "For you" ? follow.some(f => (s.title + " " + s.lede).toLowerCase().includes(f.k)) : s.cat === state.cat)) &&
    (!state.pin || (s.title + " " + s.lede).toLowerCase().includes(state.pin)) &&
    (!q || (s.title + s.lede + s.cat + s.src).toLowerCase().includes(q)));
}

function renderTabs() {
  $("tabs").innerHTML = tabs.map(c => {
    const n = c === "Saved" ? state.saved.size : c === "For you" ? follow.length : 0;
    return `<button role="tab" aria-selected="${c === state.cat}" data-cat="${esc(c)}">${esc(c)}${n ? `<i>${n}</i>` : ""}</button>`;
  }).join("");
}

function renderPins() {
  $("pins").innerHTML = pins.filter(p => state.cat === "Top" || p.sport === state.cat).map(p =>
    `<button class="pin" data-find="${esc(p.find)}" aria-pressed="${state.pin === p.find}"><span><small>${esc(p.label)}</small><b>${esc(p.name)}</b></span></button>`).join("");
}

function renderHero(s) {
  $("hero").hidden = !s;
  if (!s) return;
  $("hero").href = `#/${s.id}`;
  $("hero").innerHTML = `<div class="inner"><div class="copy">${kicker(s)}<h2>${esc(s.title)}</h2><p>${esc(s.lede)}</p><span class="more">Read the story</span></div>${art(s, true)}</div>`;
}

const card = s => `
    <div class="card">
      <a href="#/${s.id}" tabindex="-1" aria-hidden="true">${art(s)}</a>
      <button class="save" data-id="${s.id}" aria-pressed="${state.saved.has(s.id)}" aria-label="Save story: ${esc(s.title)}">${heart}</button>
      ${kicker(s)}
      <a class="title" href="#/${s.id}"><h3>${esc(s.title)}</h3></a>
      <p>${esc(s.lede)}</p>
      <span class="meta">${fmt(s.date)}${s.read ? ` · ${s.read} min read` : ""}</span>
    </div>`;
const skeletonCard = `<div class="card skel-card" aria-hidden="true"><div class="art"></div><i></i><i></i></div>`;
const pinLabel = () => names[state.pin] || pins.find(p => p.find === state.pin)?.name || state.pin;

function renderGrid() {
  const all = visible(), q = state.q.trim();
  // Hero is the newest story with a picture, only on the plain browsing views.
  const plain = !q && !state.pin && state.cat !== "Saved" && state.cat !== "For you";
  const hero = plain ? all.find(s => s.img) || all[0] : null;
  const list = hero ? all.filter(s => s !== hero) : all;
  let [h, sub] = q ? [`Results for “${q}”`, ""] : state.pin ? [`About ${pinLabel()}.`, "Stories that mention it, from every source."] : intro[state.cat];
  if (state.cat === "For you" && !q && !state.pin)
    sub = follow.length ? `Following ${follow.map(f => f.n).join(", ")}.` : "Follow drivers, teams and players with the ★ in the live tiles, and their stories land here.";
  $("title").textContent = h;
  $("sub").textContent = sub;
  $("clearpin").hidden = !state.pin;
  renderHero(hero);
  renderPins();
  renderLive();
  sync();
  const loadingNews = !stories.length;
  $("empty").hidden = all.length > 0 || loadingNews;
  $("empty").textContent = state.cat === "For you" && !q && !state.pin ? "Nothing here yet. Open Formula 1 or Tennis and tap a ★ to follow someone."
    : state.cat === "Saved" && !q ? "Nothing saved yet. Tap the bookmark on any story." : "No stories found. Try a different search.";
  $("grid").innerHTML = loadingNews ? skeletonCard.repeat(6) : list.slice(0, state.shown).map(card).join("");
  const rest = list.length - state.shown;
  $("showmore").hidden = rest <= 0;
  $("showmore").textContent = `Show more stories (${rest})`;
}

function renderStory(s) {
  const i = stories.indexOf(s), next = stories[(i + 1) % stories.length];
  const rel = stories.filter(x => x.cat === s.cat && x !== s).slice(0, 3);
  $("story").innerHTML = `
    <a class="back" href="#/">Podium</a>
    <h1>${esc(s.title)}</h1>
    <p class="lede">${esc(s.lede)}${s.link ? "…" : ""}</p>
    <div class="byline"><span>${esc(s.cat)} · ${esc(s.src)} · ${fmt(s.date)}${s.read ? ` · ${s.read} min read` : ""}</span>
      <span class="actions"><button id="share">Copy link</button><button id="bm">${heart}<span></span></button></span></div>
    ${art(s, true)}
    <div class="body">${s.body.map(p => `<p>${esc(p)}</p>`).join("")}</div>
    ${s.link ? `<a class="btn" href="${esc(s.link)}" target="_blank" rel="noopener noreferrer">Read the full article on ${esc(s.src)}</a>` : ""}
    ${rel.length ? `<div class="related"><span class="kicker">More from ${esc(s.cat)}</span>${rel.map(r => `<a class="rel" href="#/${r.id}">${art(r)}<span>${kicker(r)}<b>${esc(r.title)}</b></span></a>`).join("")}</div>` : ""}
    <div class="next"><span class="kicker">Up next</span><a href="#/${next.id}"><b>${esc(next.title)}</b></a></div>`;
  const bm = $("bm"), label = () => bm.lastChild.textContent = state.saved.has(s.id) ? "Saved" : "Save";
  label();
  bm.onclick = () => { save(s.id); label(); renderTabs(); };
  const sh = $("share");
  sh.onclick = async () => {
    try {
      if (navigator.share) await navigator.share({ title: s.title, url: location.href });
      else { await navigator.clipboard.writeText(location.href); sh.textContent = "Link copied"; setTimeout(() => sh.textContent = "Copy link", 2000); }
    } catch {}
  };
}

function route() {
  const s = stories.find(x => "#/" + x.id === location.hash);
  $("home").hidden = !!s;
  $("story").hidden = !s;
  document.title = s ? `${s.title} – Podium` : "Podium";
  if (s) renderStory(s); else { renderTabs(); renderGrid(); }
  scrollTo(0, 0);
}

$("tabs").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  state.cat = b.dataset.cat; state.pin = ""; state.shown = PAGE; renderTabs(); renderGrid();
};
$("pins").onclick = e => {
  const b = e.target.closest(".pin"); if (!b) return;
  state.pin = state.pin === b.dataset.find ? "" : b.dataset.find; state.shown = PAGE; renderGrid();
};
$("grid").onclick = e => {
  const b = e.target.closest(".save"); if (!b) return;
  save(b.dataset.id); renderTabs(); renderGrid();
};
$("q").oninput = e => {
  state.q = e.target.value; state.shown = PAGE;
  if (location.hash !== "#/" && location.hash) location.hash = "#/"; else renderGrid();
};
$("clearpin").onclick = () => { state.pin = ""; state.shown = PAGE; renderGrid(); };
$("showmore").onclick = () => { state.shown += PAGE; renderGrid(); };
addEventListener("hashchange", route);
addEventListener("keydown", e => {
  const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
  if (e.key === "/" && !typing) { e.preventDefault(); $("q").focus(); }
  if (e.key === "Escape") { if (typing) { $("q").value = ""; state.q = ""; $("q").blur(); renderGrid(); } else if (location.hash.length > 2) location.hash = "#/"; }
});

route();
load();

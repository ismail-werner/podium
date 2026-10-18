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

const tabs = ["Top", "Formula 1", "Tennis", "Saved"];
const intro = {
  Top: ["Top stories.", "Formula 1 and tennis, in one calm place."],
  "Formula 1": ["Formula 1.", "Every session, every verdict. Mercedes and Hamilton pinned."],
  Tennis: ["Tennis.", "Tours, tournaments and the stories behind them. Sinner and the ATP Finals pinned."],
  Saved: ["Saved.", "Your bookmarked stories."]
};
const tone = { "Formula 1": ["#1d1d1f", "#e10600"], Tennis: ["#0b3d2e", "#c6e03a"] };
const fallbackTone = ["#1d1d1f", "#6e6e73"];

let stories = [];
const $ = id => document.getElementById(id);
const state = { cat: "Top", q: "", pin: "", saved: new Set(JSON.parse(localStorage.getItem("saved") || "[]")) };
const fmt = d => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
// Feed text is untrusted: escape everything that goes into innerHTML.
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const text = html => new DOMParser().parseFromString(html || "", "text/html").body.textContent.replace(/\s+/g, " ").trim();
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);
const art = s => {
  const [c1, c2] = tone[s.cat] || fallbackTone;
  const img = s.img && /^https:\/\//.test(s.img) ? `background:url('${encodeURI(s.img).replace(/'/g, "%27")}') center/cover` : "";
  return `<div class="art" style="--c1:${c1};--c2:${c2};${img}"></div>`;
};

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

const heart = `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M5 2h10v16l-5-4-5 4z"/></svg>`;

function save(id) {
  state.saved.has(id) ? state.saved.delete(id) : state.saved.add(id);
  localStorage.setItem("saved", JSON.stringify([...state.saved]));
}

function visible() {
  const q = state.q.trim().toLowerCase();
  return stories.filter(s =>
    (state.cat === "Top" || (state.cat === "Saved" ? state.saved.has(s.id) : s.cat === state.cat)) &&
    (!state.pin || (s.title + " " + s.lede).toLowerCase().includes(state.pin)) &&
    (!q || (s.title + s.lede + s.cat + s.src).toLowerCase().includes(q)));
}

function renderTabs() {
  $("tabs").innerHTML = tabs.map(c => {
    const n = c === "Saved" ? state.saved.size : 0;
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
  $("hero").innerHTML = `<div class="inner"><div class="copy"><span class="kicker">${esc(s.cat)} · ${esc(s.src)}</span><h2>${esc(s.title)}</h2><p>${esc(s.lede)}</p><span class="more">Read the story</span></div>${art(s)}</div>`;
}

function renderGrid() {
  const all = visible();
  // Hero is the newest story with a picture, only on the plain browsing views.
  const plain = !state.q.trim() && !state.pin && state.cat !== "Saved";
  const hero = plain ? all.find(s => s.img) || all[0] : null;
  const list = hero ? all.filter(s => s !== hero) : all;
  const [h, sub] = state.q.trim() ? [`Results for “${state.q.trim()}”`, ""] : intro[state.cat];
  $("title").textContent = h;
  $("sub").textContent = sub;
  renderHero(hero);
  renderPins();
  $("empty").hidden = all.length > 0;
  $("empty").textContent = !stories.length ? "Loading the latest news…" : state.cat === "Saved" && !state.q ? "Nothing saved yet. Tap the bookmark on any story." : "No stories found. Try a different search.";
  $("grid").innerHTML = list.map((s, i) => `
    <div class="card" style="--i:${i}">
      <a href="#/${s.id}" aria-label="${esc(s.title)}">${art(s)}</a>
      <button class="save" data-id="${s.id}" aria-pressed="${state.saved.has(s.id)}" aria-label="Save story">${heart}</button>
      <span class="kicker">${esc(s.cat)} · ${esc(s.src)}</span>
      <a href="#/${s.id}"><h3>${esc(s.title)}</h3></a>
      <p>${esc(s.lede)}</p>
      <span class="meta">${fmt(s.date)}${s.read ? ` · ${s.read} min read` : ""}</span>
    </div>`).join("");
}

function renderStory(s) {
  const i = stories.indexOf(s), next = stories[(i + 1) % stories.length];
  $("story").innerHTML = `
    <a class="back" href="#/">Podium</a>
    <h1>${esc(s.title)}</h1>
    <p class="lede">${esc(s.lede)}${s.link ? "…" : ""}</p>
    <div class="byline"><span>${esc(s.cat)} · ${esc(s.src)} · ${fmt(s.date)}${s.read ? ` · ${s.read} min read` : ""}</span>
      <button id="bm">${heart}<span></span></button></div>
    ${art(s)}
    <div class="body">${s.body.map(p => `<p>${esc(p)}</p>`).join("")}</div>
    ${s.link ? `<a class="btn" href="${esc(s.link)}" target="_blank" rel="noopener noreferrer">Read the full article on ${esc(s.src)}</a>` : ""}
    <div class="next"><span class="kicker">Up next</span><a href="#/${next.id}"><b>${esc(next.title)}</b></a></div>`;
  const bm = $("bm"), label = () => bm.lastChild.textContent = state.saved.has(s.id) ? "Saved" : "Save";
  label();
  bm.onclick = () => { save(s.id); label(); renderTabs(); };
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
  state.cat = b.dataset.cat; state.pin = ""; renderTabs(); renderGrid();
};
$("pins").onclick = e => {
  const b = e.target.closest(".pin"); if (!b) return;
  state.pin = state.pin === b.dataset.find ? "" : b.dataset.find; renderGrid();
};
$("grid").onclick = e => {
  const b = e.target.closest(".save"); if (!b) return;
  save(b.dataset.id); renderTabs(); renderGrid();
};
$("q").oninput = e => {
  state.q = e.target.value;
  if (location.hash !== "#/" && location.hash) location.hash = "#/"; else renderGrid();
};
addEventListener("hashchange", route);
addEventListener("keydown", e => {
  const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
  if (e.key === "/" && !typing) { e.preventDefault(); $("q").focus(); }
  if (e.key === "Escape") { if (typing) { $("q").value = ""; state.q = ""; $("q").blur(); renderGrid(); } else if (location.hash.length > 2) location.hash = "#/"; }
});

route();
load();

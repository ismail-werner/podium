// Live sport data: wait tiles, standings and rankings, plus the "follow" list.
// F1: Jolpica (the Ergast successor). Tennis: ESPN's public site API. Both are free, keyless and allow browser requests.
// Loaded before app.js; it reads app.js's globals (state, esc, renderGrid...) only when called.
const liveState = { f1: "Drivers", tennis: "ATP", h2h: { f1: [0, 3], tennis: [0, 1] } };
const picks = JSON.parse(localStorage.getItem("picks") || "{}"); // { contest: key }, kept on this device only
let f1 = null, tn = null, liveSig = "";
const rank = {}, loading = {}, failed = {}, done = {}, names = {};
const follow = JSON.parse(localStorage.getItem("follow") || "[]"); // [{ k: match key, n: display name }]
const isFollowed = k => follow.some(f => f.k === k);
const L = () => document.getElementById("live");

const getJSON = u => fetch(u).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
async function cached(key, ttl, fn) {
  try { const c = JSON.parse(localStorage.getItem(key) || "null"); if (c && Date.now() - c.t < ttl) return c.d; } catch {}
  const d = await fn();
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), d })); } catch {}
  return d;
}

const loadF1 = () => cached("f1:v2", 10 * 60e3, async () => {
  const J = "https://api.jolpi.ca/ergast/f1/current/";
  const [n, d, c] = await Promise.all(["next", "driverStandings", "constructorStandings"].map(p => getJSON(J + p + ".json").then(j => j.MRData)));
  const r = n.RaceTable.Races[0];
  const at = x => `${x.date}T${x.time || "12:00:00Z"}`;
  const label = { FirstPractice: "Practice 1", SecondPractice: "Practice 2", ThirdPractice: "Practice 3", SprintQualifying: "Sprint qualifying", SprintShootout: "Sprint shootout", Sprint: "Sprint", Qualifying: "Qualifying" };
  const sessions = r ? [...Object.entries(label).filter(([k]) => r[k]).map(([k, name]) => ({ name, at: at(r[k]) })), { name: "Race", at: at(r) }].sort((a, b) => a.at.localeCompare(b.at)) : [];
  const dl = d.StandingsTable.StandingsLists[0], cl = c.StandingsTable.StandingsLists[0];
  return {
    race: r && { name: r.raceName, round: r.round, place: `${r.Circuit.Location.locality}, ${r.Circuit.Location.country}`, at: at(r), sessions },
    after: dl?.round,
    Drivers: (dl?.DriverStandings || []).slice(0, 10).map(x => ({ pos: +x.position, name: `${x.Driver.givenName} ${x.Driver.familyName}`, key: x.Driver.familyName.toLowerCase(), sub: x.Constructors[0].name, pts: +x.points })),
    Constructors: (cl?.ConstructorStandings || []).slice(0, 10).map(x => ({ pos: +x.position, name: x.Constructor.name, key: x.Constructor.name.toLowerCase(), sub: "", pts: +x.points }))
  };
});

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/tennis/";
const loadTennis = () => cached("tennis:v2", 30 * 60e3, async () => {
  const ymd = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10).replace(/-/g, "");
  const calls = ["atp", "wta"].flatMap(t => [0, 7].map(n => getJSON(`${ESPN}${t}/scoreboard?dates=${ymd(n)}`)
    .then(j => (j.events || []).map(e => ({ tour: t.toUpperCase(), id: e.id, name: e.name, start: e.date, end: e.endDate, state: e.status?.type?.state || "", place: (typeof e.venue === "string" ? e.venue : e.venue?.displayName) || "" })))
    .catch(() => [])));
  const all = (await Promise.all(calls)).flat();
  return { events: [...new Map(all.map(e => [e.tour + e.id, e])).values()].filter(e => e.start && e.end) };
});

// Rankings payloads are large (hundreds of KB), so they load only when the Tennis tab asks for them, and only the top 10 are kept.
const loadRankings = tour => cached("rank:" + tour, 6 * 36e5, async () => {
  const r = (await getJSON(`${ESPN}${tour.toLowerCase()}/rankings`)).rankings[0];
  return { updated: r.update, rows: r.ranks.slice(0, 10).map(x => ({ pos: x.current, prev: x.previous, name: x.athlete.displayName, key: x.athlete.lastName.toLowerCase(), sub: x.athlete.flag?.alt || "", pts: Math.round(x.points) })) };
});

/* ---------- countdown ---------- */
const parts = ms => { const s = Math.max(0, Math.floor(ms / 1e3)); return [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60]; };
const pad = n => String(n).padStart(2, "0");
const count = at => new Date(at) - Date.now() <= 0
  ? `<p class="underway"><i></i>Underway now</p>`
  : `<div class="units" data-until="${esc(at)}">${["Days", "Hours", "Minutes", "Seconds"].map((l, i) => `<div class="unit"><b>${pad(parts(new Date(at) - Date.now())[i])}</b><span>${l}</span></div>`).join("")}</div>`;

const reduce = matchMedia("(prefers-reduced-motion: reduce)");
setInterval(() => {
  if (document.hidden) return;
  document.querySelectorAll("[data-until]").forEach(u => {
    const ms = new Date(u.dataset.until) - Date.now();
    if (ms <= 0) { u.outerHTML = `<p class="underway"><i></i>Underway now</p>`; return; }
    parts(ms).forEach((v, i) => {
      const b = u.children[i].firstElementChild, t = pad(v);
      if (b.textContent === t) return;
      b.textContent = t;
      if (!reduce.matches) b.animate([{ opacity: .35, transform: "translateY(-5px)" }, { opacity: 1, transform: "none" }], { duration: 280, easing: "ease-out" });
    });
  });
  document.querySelectorAll(".sess[data-at]").forEach(s => s.classList.toggle("past", new Date(s.dataset.at) < Date.now()));
}, 1000);

/* ---------- tiles ---------- */
const dt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const md = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const star = `<svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M10 2.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 7.8l5-.7z"/></svg>`;

function icsLink(title, start, end, allDay) {
  const f = d => new Date(d).toISOString().replace(/[-:]|\.\d{3}/g, "");
  const day = d => f(d).slice(0, 8);
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Podium//EN", "BEGIN:VEVENT", `UID:${f(start)}-${title.replace(/\W/g, "")}@podium`, `DTSTAMP:${f(new Date())}`,
    allDay ? `DTSTART;VALUE=DATE:${day(start)}` : `DTSTART:${f(start)}`,
    allDay ? `DTEND;VALUE=DATE:${day(new Date(new Date(end).getTime() + 864e5))}` : `DTEND:${f(end)}`,
    `SUMMARY:${title.replace(/([,;\\])/g, "\\$1")}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  return `href="data:text/calendar;charset=utf-8,${encodeURIComponent(body)}" download="${esc(title.replace(/\W+/g, "-").toLowerCase())}.ics"`;
}

function f1Tile() {
  const r = f1.race;
  if (!r) return `<section class="tile f1"><span class="kicker">Formula 1</span><h3>Season complete</h3><p class="where">The final standings are in. See you next season.</p></section>`;
  const next = r.sessions.findIndex(s => new Date(s.at) > Date.now());
  const end = new Date(new Date(r.at).getTime() + 2 * 36e5).toISOString();
  return `<section class="tile f1" aria-label="Next race">
    <span class="kicker"><i class="dot"></i>Next race · Round ${esc(r.round)}</span>
    <h3>${esc(r.name)}</h3><p class="where">${esc(r.place)}</p>
    ${count(r.at)}
    <ol class="sessions" aria-label="Race weekend schedule">${r.sessions.map((s, i) => `<li class="sess${i === next ? " next" : ""}" data-at="${esc(s.at)}"><span>${esc(s.name)}</span><time datetime="${esc(s.at)}">${dt.format(new Date(s.at))}</time></li>`).join("")}</ol>
    <a class="cal" ${icsLink(r.name, r.at, end, false)}>Add the race to your calendar</a></section>`;
}

function tennisTile() {
  const now = Date.now(), ev = tn.events;
  const up = ev.filter(e => new Date(e.start) > now).sort((a, b) => a.start.localeCompare(b.start));
  const on = ev.filter(e => new Date(e.start) <= now && new Date(e.end) >= now && e.state !== "post");
  const n = up[0];
  if (!n) return `<section class="tile tennis"><span class="kicker">Tennis</span><h3>Between tournaments</h3><p class="where">The next event will appear here as soon as it is on the calendar.</p></section>`;
  const more = [...on.map(e => ({ ...e, live: true })), ...up.slice(1, 3)];
  return `<section class="tile tennis" aria-label="Next tournament">
    <span class="kicker"><i class="dot"></i>Next up · ${esc(n.tour)}</span>
    <h3>${esc(n.name)}</h3><p class="where">${esc(n.place ? n.place + " · " : "")}${md.format(new Date(n.start))} – ${md.format(new Date(n.end))}</p>
    ${count(n.start)}
    ${more.length ? `<ol class="sessions" aria-label="Also on the tour">${more.map(e => `<li class="sess${e.live ? " now" : ""}"><span>${esc(e.name)}<small>${esc(e.tour)}</small></span><time>${e.live ? "Ends " + md.format(new Date(e.end)) : md.format(new Date(e.start))}</time></li>`).join("")}</ol>` : ""}
    <a class="cal" ${icsLink(n.name, n.start, n.end, true)}>Add the tournament to your calendar</a></section>`;
}

function row(r, max, i) {
  names[r.key] = r.name;
  const d = r.prev ? r.prev - r.pos : 0;
  return `<li class="rk${r.pos === 1 ? " lead" : ""}" style="--w:${(r.pts / max * 100).toFixed(1)}%;--i:${i}">
    <span class="pos">${r.pos}</span>
    <button class="who" data-find="${esc(r.key)}" title="Show stories about ${esc(r.name)}">${esc(r.name)}${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</button>
    ${d ? `<span class="trend ${d > 0 ? "up" : "down"}" aria-label="${d > 0 ? "Up" : "Down"} ${Math.abs(d)}">${d > 0 ? "▲" : "▼"}${Math.abs(d)}</span>` : "<span></span>"}
    <b>${r.pts.toLocaleString()}</b>
    <button class="star" data-key="${esc(r.key)}" data-name="${esc(r.name)}" aria-pressed="${isFollowed(r.key)}" aria-label="Follow ${esc(r.name)}">${star}</button></li>`;
}

function board(sport, title, opts, rows, foot) {
  const active = liveState[sport], max = Math.max(...rows.map(r => r.pts), 1);
  return `<section class="tile board" aria-label="${esc(title)}">
    <div class="board-head"><h3>${esc(title)}</h3>
      <div class="seg" role="tablist">${opts.map(o => `<button role="tab" aria-selected="${o === active}" data-seg="${sport}" data-v="${o}">${o}</button>`).join("")}</div></div>
    <ol class="ranks">${rows.map((r, i) => row(r, max, i)).join("")}</ol>
    <p class="foot">${foot}</p></section>`;
}

const nextTennis = () => tn.events.filter(e => new Date(e.start) > Date.now()).sort((a, b) => a.start.localeCompare(b.start))[0];
const short = n => n.split(" ").slice(-1)[0];

function predictTile(contest, title, rows, closesAt) {
  const closed = new Date(closesAt) <= Date.now(), mine = picks[contest];
  const foot = closed ? "Predictions are closed." : mine ? "Locked in. Tap another name to change your call until it starts." : "Pick one. Your call is saved on this device.";
  return `<section class="tile mini predict" aria-label="Make your prediction"><span class="kicker">Make your call</span><h3>${esc(title)}</h3>
    <div class="chips" role="group" aria-label="Pick a winner">${rows.map(r => `<button class="chip" data-contest="${esc(contest)}" data-key="${esc(r.key)}" aria-pressed="${mine === r.key}"${closed ? " disabled" : ""}>${esc(short(r.name))}</button>`).join("")}</div>
    <p class="foot">${foot}</p></section>`;
}

function duel(rows, i, j) {
  const A = rows[i], B = rows[j];
  if (!A || !B || A === B) return `<p class="gap">Pick two different names to compare.</p>`;
  const tot = (A.pts + B.pts) || 1, gap = A.pts - B.pts;
  const side = (r, cls) => `<div class="${cls}"><b>${r.pts.toLocaleString()}</b><span>${esc(r.name)}</span><small>P${r.pos}${r.sub ? " · " + esc(r.sub) : ""}</small></div>`;
  return `<div class="duel">${side(A, "l")}${side(B, "r")}</div>
    <div class="splitbar" role="img" aria-label="${esc(A.name)} ${A.pts} points, ${esc(B.name)} ${B.pts} points"><i style="--a:${(A.pts / tot * 100).toFixed(1)}%"></i></div>
    <p class="gap">${gap === 0 ? "Level on points" : `${esc(short((gap > 0 ? A : B).name))} leads by ${Math.abs(gap).toLocaleString()} points`}</p>`;
}

function h2hTile(sport, rows) {
  const [a, b] = liveState.h2h[sport], who = sport === "f1" ? "driver" : "player";
  const sel = (side, idx) => `<select data-h2h="${side}" data-sport="${sport}" aria-label="Choose ${side === "a" ? "first" : "second"} ${who}">${rows.map((r, i) => `<option value="${i}"${i === idx ? " selected" : ""}>${esc(r.name)}</option>`).join("")}</select>`;
  return `<section class="tile mini h2h" data-sport="${sport}" aria-label="Head to head"><span class="kicker">Head to head</span>
    <div class="vs-pick">${sel("a", a)}<span>vs</span>${sel("b", b)}</div><div class="vs">${duel(rows, a, b)}</div></section>`;
}
const h2hRows = sport => sport === "f1" ? f1?.Drivers : rank[liveState.tennis]?.rows;

const skel = `<div class="tile skel" aria-hidden="true"></div>`;

function need(key, fn, set) {
  if (loading[key] || failed[key] || done[key]) return;
  loading[key] = true;
  fn().then(d => { set(d); done[key] = true; }).catch(() => { failed[key] = true; }).finally(() => { loading[key] = false; liveSig = ""; renderLive(); });
}

function renderLive() {
  const el = L();
  const view = { Top: "both", "Formula 1": "f1", Tennis: "tennis" }[state.cat];
  if (!view || state.q.trim() || state.pin) { el.hidden = true; liveSig = ""; return; }
  const wantF1 = view !== "tennis", wantTn = view !== "f1";
  if (wantF1) need("f1", loadF1, d => { f1 = d; });
  if (wantTn) need("tn", loadTennis, d => { tn = d; });
  const rk = liveState.tennis;
  if (view === "tennis") need("rank" + rk, () => loadRankings(rk), d => { rank[rk] = d; });
  const rkFailed = failed["rank" + rk];

  const sig = JSON.stringify([view, liveState, !!f1, !!tn, !!rank[rk], follow.length, failed]);
  if (sig === liveSig && !el.hidden) return;
  liveSig = sig;

  const tiles = [];
  if (wantF1 && !failed.f1) tiles.push(f1 ? f1Tile() : skel);
  if (wantTn && !failed.tn) tiles.push(tn ? tennisTile() : skel);
  if (view === "f1" && f1) tiles.push(board("f1", "Standings", ["Drivers", "Constructors"], f1[liveState.f1],
    `After round ${esc(f1.after || "–")} · Data: Jolpica`));
  if (view === "tennis" && !rkFailed) tiles.push(rank[rk]
    ? board("tennis", "Rankings", ["ATP", "WTA"], rank[rk].rows, `Updated ${md.format(new Date(rank[rk].updated))} · Data: ESPN`)
    : skel);
  if (view === "f1" && f1?.race) {
    tiles.push(predictTile("f1:" + f1.race.name, `Who wins the ${f1.race.name}?`, f1.Drivers.slice(0, 6), f1.race.at));
    tiles.push(h2hTile("f1", f1.Drivers));
  }
  if (view === "tennis" && tn && rank[rk]) {
    const n = nextTennis();
    if (n && rank[n.tour]) tiles.push(predictTile("tn:" + n.name, `Who lifts the ${n.name}?`, rank[n.tour].rows.slice(0, 6), n.start));
    tiles.push(h2hTile("tennis", rank[rk].rows));
  }
  el.innerHTML = tiles.join("");
  el.dataset.view = view;
  el.hidden = !tiles.length;
}

/* ---------- interactions ---------- */
L().addEventListener("click", e => {
  const seg = e.target.closest("[data-seg]");
  if (seg) { liveState[seg.dataset.seg] = seg.dataset.v; liveSig = ""; renderLive(); return; }

  const st = e.target.closest(".star");
  if (st) {
    const k = st.dataset.key, i = follow.findIndex(f => f.k === k);
    i < 0 ? follow.push({ k, n: st.dataset.name }) : follow.splice(i, 1);
    localStorage.setItem("follow", JSON.stringify(follow));
    st.setAttribute("aria-pressed", i < 0);
    if (i < 0 && !reduce.matches) st.animate([{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }], { duration: 320, easing: "ease-out" });
    renderTabs();
    return;
  }

  const chip = e.target.closest(".chip");
  if (chip) {
    const c = chip.dataset.contest, same = picks[c] === chip.dataset.key;
    same ? delete picks[c] : picks[c] = chip.dataset.key;
    localStorage.setItem("picks", JSON.stringify(picks));
    chip.parentElement.querySelectorAll(".chip").forEach(x => x.setAttribute("aria-pressed", picks[c] === x.dataset.key));
    chip.closest(".predict").querySelector(".foot").textContent = same ? "Pick one. Your call is saved on this device." : "Locked in. Tap another name to change your call until it starts.";
    if (!same && !reduce.matches) chip.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 300, easing: "ease-out" });
    return;
  }

  const who = e.target.closest(".who");
  if (who) {
    state.pin = who.dataset.find; state.shown = PAGE;
    renderGrid();
    document.getElementById("title").scrollIntoView({ block: "start" });
  }
});

L().addEventListener("change", e => {
  const s = e.target.closest("[data-h2h]");
  if (!s) return;
  const sport = s.dataset.sport, pair = liveState.h2h[sport];
  pair[s.dataset.h2h === "a" ? 0 : 1] = +s.value;
  s.closest(".h2h").querySelector(".vs").innerHTML = duel(h2hRows(sport), pair[0], pair[1]);
});

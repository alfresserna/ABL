// ============ ABL — Astonishing Basketball League (Standalone) ============
const STORE_KEY = 'abl-store-v6';

const DEFAULT_TEAM_NAMES = [
  'Zeniths', 'Ciphers', 'Flux', 'Sabers', 'Volts', 'Venoms', 'Majesty', 'Cosmos',
  'Aura', 'Scepters', 'Sonics', 'Vipers', 'Zephyrs', 'Onyx', 'Strikers', 'Blazers',
  'Sentinels', 'Rogues', 'Alpha', 'Phantoms', 'Nova', 'Vortex', 'Titans', 'Apex'
];
const PALETTE = ['#e11d48', '#f97316', '#facc15', '#84cc16', '#10b981', '#06b6d4', '#e63fcf', '#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#ea580c', '#ca8a04', '#65a30d', '#059669', '#0891b2', '#2563eb', '#4f46e5', '#9333ea', '#db2777', '#dc2626', '#d97706', '#16a34a', '#0284c7'];

const CUPS = ['All Cup', 'Cluster Cup', 'Bracket Cup'];
const ATTRS = ['Shooting', 'Defense', 'Passing', 'Playmaking', 'Decision'];
const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F'];

// ============ STATE ============
function defaultState() {
  const teams = DEFAULT_TEAM_NAMES.map((n, i) => ({
    id: 't' + i, name: n, color: PALETTE[i % PALETTE.length],
    bracket: i < 12 ? 'Gemini' : 'ChatGPT',
    group: GROUPS[i % 6],
    attrs: Object.fromEntries(ATTRS.map(a => [a, 65]))
  }));
  return {
    season: 1, cup: 'All Cup', ownerMode: false,
    teams,
    schedule: [],          // [{day,homeId,awayId,homeScore,awayScore,played, seriesId?, gameNo?}] — Bracket Cup uses series
    bracketCupSeries: [],  // [{id,homeId,awayId,homeWins,awayWins,games}]
    playoffs: null,
    history: [],
    awards: [],
    pendingChampion: null
  };
}
let S = load();
function load() { try { const r = localStorage.getItem(STORE_KEY); if (r) return JSON.parse(r); } catch (e) { } return defaultState(); }
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
function reset() { S = defaultState(); save(); render(); }

// ============ HELPERS ============
const $ = (q, el = document) => el.querySelector(q);
const teamById = id => S.teams.find(t => t.id === id);
const overall = t => Math.round(ATTRS.reduce((s, a) => s + t.attrs[a], 0) / ATTRS.length);

function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]] } return a }

function roundRobin(ids) {
  const n = ids.length;
  const arr = ids.slice();
  if (n % 2 === 1) arr.push(null);
  const m = arr.length;
  const rounds = [];
  for (let r = 0; r < m - 1; r++) {
    const day = [];
    for (let i = 0; i < m / 2; i++) {
      const a = arr[i], b = arr[m - 1 - i];
      if (a !== null && b !== null) day.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(day);
    arr.splice(1, 0, arr.pop());
  }
  return rounds;
}

function generateSchedule() {
  S.schedule = [];
  S.bracketCupSeries = [];
  S.playoffs = null;
  if (S.cup === 'All Cup') {
    const ids = shuffle(S.teams.map(t => t.id));
    const rounds = roundRobin(ids);
    rounds.forEach((day, di) => day.forEach(([h, a]) => S.schedule.push({ day: di + 1, homeId: h, awayId: a, homeScore: null, awayScore: null, played: false })));
  } else if (S.cup === 'Cluster Cup') {
    let day = 0;
    GROUPS.forEach(g => {
      const ids = shuffle(S.teams.filter(t => t.group === g).map(t => t.id));
      const rounds = roundRobin(ids);
      rounds.forEach((d, di) => d.forEach(([h, a]) => S.schedule.push({ day: day + di + 1, group: g, homeId: h, awayId: a, homeScore: null, awayScore: null, played: false })));
      day += rounds.length;
    });
  } else if (S.cup === 'Bracket Cup') {
    // Per-bracket Bo3 series round-robin
    let seriesIdx = 0, day = 0;
    ['Gemini', 'ChatGPT'].forEach(b => {
      const ids = shuffle(S.teams.filter(t => t.bracket === b).map(t => t.id));
      const rounds = roundRobin(ids);
      rounds.forEach((d, di) => {
        d.forEach(([h, a]) => {
          const sid = 'bcs-' + (seriesIdx++);
          S.bracketCupSeries.push({ id: sid, bracket: b, homeId: h, awayId: a, homeWins: 0, awayWins: 0, games: [], bestOf: 3, complete: false, winnerId: null });
          for (let gn = 1; gn <= 3; gn++) {
            S.schedule.push({ day: day + di + 1, bracket: b, seriesId: sid, gameNo: gn, homeId: h, awayId: a, homeScore: null, awayScore: null, played: false, skipped: false });
          }
        });
      });
      day += rounds.length;
    });
  }
  save();
}

function simGame(home, away) {
  const hr = overall(home) + 4 + (Math.random() - 0.5) * 18;
  const ar = overall(away) + (Math.random() - 0.5) * 18;
  const base = 92;
  let hs = Math.max(65, Math.round(base + (hr - overall(away)) * 0.4 + (Math.random() - 0.5) * 22));
  let as = Math.max(65, Math.round(base + (ar - overall(home)) * 0.4 + (Math.random() - 0.5) * 22));
  if (hs === as) (Math.random() > .5 ? hs++ : as++);
  return { h: hs, a: as };
}

function recordSeriesGame(g) {
  if (!g.seriesId) return;
  const s = S.bracketCupSeries.find(x => x.id === g.seriesId);
  if (!s || s.complete) return;
  s.games.push({ h: g.homeScore, a: g.awayScore, no: g.gameNo });
  if (g.homeScore > g.awayScore) s.homeWins++; else s.awayWins++;
  const need = Math.ceil(s.bestOf / 2);
  if (s.homeWins >= need || s.awayWins >= need) {
    s.complete = true;
    s.winnerId = s.homeWins > s.awayWins ? s.homeId : s.awayId;
    // mark remaining series games as skipped
    S.schedule.forEach(x => { if (x.seriesId === s.id && !x.played) x.skipped = true; });
  }
}

function simAllRegular() {
  S.schedule.forEach(g => {
    if (g.played || g.skipped) return;
    if (g.seriesId) {
      const s = S.bracketCupSeries.find(x => x.id === g.seriesId);
      if (s && s.complete) { g.skipped = true; return; }
    }
    const r = simGame(teamById(g.homeId), teamById(g.awayId));
    g.homeScore = r.h; g.awayScore = r.a; g.played = true;
    if (g.seriesId) recordSeriesGame(g);
  });
  save();
}


// ALL CUP / CLUSTER CUP standings (per played games)
function standings(games = S.schedule, teams = S.teams) {
  const m = {};
  teams.forEach(t => m[t.id] = { team: t, w: 0, l: 0, pf: 0, pa: 0 });

  games.forEach(g => {
    if (!g.played) return;

    // Update home team if they are in the tracked teams list
    if (m[g.homeId]) {
      m[g.homeId].pf += g.homeScore;
      m[g.homeId].pa += g.awayScore;
      if (g.homeScore > g.awayScore) {
        m[g.homeId].w++;
      } else {
        m[g.homeId].l++;
      }
    }

    // Update away team if they are in the tracked teams list
    if (m[g.awayId]) {
      m[g.awayId].pf += g.awayScore;
      m[g.awayId].pa += g.homeScore;
      if (g.awayScore > g.homeScore) {
        m[g.awayId].w++;
      } else {
        m[g.awayId].l++;
      }
    }
  });

  return Object.values(m).sort((a, b) => b.w - a.w || b.pf - a.pf);
}

// BRACKET CUP standings (series wins; PF = total pts in series games)
function bracketCupStandings(bracket) {
  const teams = S.teams.filter(t => t.bracket === bracket);
  const m = {}; teams.forEach(t => m[t.id] = { team: t, w: 0, l: 0, pf: 0, pa: 0 });
  S.bracketCupSeries.filter(s => s.bracket === bracket && s.complete).forEach(s => {
    if (s.winnerId === s.homeId) { m[s.homeId].w++; m[s.awayId].l++ } else { m[s.awayId].w++; m[s.homeId].l++ }
  });
  S.schedule.filter(g => g.bracket === bracket && g.played).forEach(g => {
    m[g.homeId].pf += g.homeScore; m[g.homeId].pa += g.awayScore;
    m[g.awayId].pf += g.awayScore; m[g.awayId].pa += g.homeScore;
  });
  return Object.values(m).sort((a, b) => b.w - a.w || b.pf - a.pf);
}

// ============ PLAYOFFS ============
function mkSeries(id, round, col, label, homeId, awayId, bestOf, extra = {}) {
  return { id, round, col, label, homeId, awayId, homeWins: 0, awayWins: 0, games: [], bestOf, complete: false, winnerId: null, loserId: null, ...extra };
}

function generatePlayoffs() {
  if (S.cup === 'All Cup') return genAllCupPO();
  if (S.cup === 'Cluster Cup') return genClusterPO();
  if (S.cup === 'Bracket Cup') return genBracketCupPO();
}

function genAllCupPO() {
  const series = [];
  const seedsByBracket = {};
  ['Gemini', 'ChatGPT'].forEach(b => {
    const teams = S.teams.filter(t => t.bracket === b);
    const top = standings(S.schedule, teams).slice(0, 8).map(r => r.team.id);
    if (top.length < 8) return;
    seedsByBracket[b] = top;
    // Side 1: #1v#8 (M1) and #4v#5 (M2). Side 2: #2v#7 (M3) and #3v#6 (M4)
    const mains = [
      { id: `${b}-QF-M1`, side: 1, h: top[0], a: top[7], label: `[${b}] #1 vs #8` },
      { id: `${b}-QF-M2`, side: 1, h: top[3], a: top[4], label: `[${b}] #4 vs #5` },
      { id: `${b}-QF-M3`, side: 2, h: top[1], a: top[6], label: `[${b}] #2 vs #7` },
      { id: `${b}-QF-M4`, side: 2, h: top[2], a: top[5], label: `[${b}] #3 vs #6` },
    ];
    mains.forEach(m => series.push(mkSeries(m.id, 'QF-Main', 'Main', m.label, m.h, m.a, 5, { side: m.side })));
    series.push(mkSeries(`${b}-QF-D1`, 'QF-DoD', 'Do or Die', `[${b}] DoD #8 vs #5`, top[7], top[4], 5, { side: 1 }));
    series.push(mkSeries(`${b}-QF-D2`, 'QF-DoD', 'Do or Die', `[${b}] DoD #7 vs #6`, top[6], top[5], 5, { side: 2 }));
  });
  S.playoffs = { mode: 'AllCup', round: 'QF', series, seedsByBracket, placement: {} };
  save();
}

function genClusterPO() {
  // 6 groups → top 2 each (12 teams) + 4 best 3rd-place finishers by standing → 16 total
  const top16 = [];
  const thirds = [];
  GROUPS.forEach(g => {
    const teams = S.teams.filter(t => t.group === g);
    const games = S.schedule.filter(x => x.group === g);
    const st = standings(games, teams);
    if (st[0]) top16.push(st[0].team.id);
    if (st[1]) top16.push(st[1].team.id);
    if (st[2]) thirds.push(st[2]);
    if (st[3]) thirds.push(st[3]);
  });
  thirds.sort((a, b) => b.w - a.w || b.pf - a.pf);
  thirds.slice(0, 4).forEach(r => top16.push(r.team.id));
  const bracket = shuffle(top16);
  const series = [];
  for (let i = 0; i < 8; i++) {
    series.push(mkSeries(`CC-R16-${i + 1}`, 'R16', 'Round of 16', `R16 Match ${i + 1}`, bracket[i * 2], bracket[i * 2 + 1], 3));
  }
  S.playoffs = { mode: 'Cluster', round: 'R16', series, top16, placement: {} };
  save();
}

function genBracketCupPO() {
  const series = [];
  const seedsByBracket = {};
  ['Gemini', 'ChatGPT'].forEach(b => {
    const top = bracketCupStandings(b).slice(0, 8).map(r => r.team.id);
    seedsByBracket[b] = top;
    if (top.length < 8) return;
    const pairs = [[0, 7], [3, 4], [1, 6], [2, 5]];
    pairs.forEach((p, i) => series.push(mkSeries(`${b}-BC-QF${i + 1}`, 'BC-QF', 'Quarterfinals', `[${b}] Seed ${p[0] + 1} vs ${p[1] + 1}`, top[p[0]], top[p[1]], 7)));
  });
  S.playoffs = { mode: 'BracketCup', round: 'QF', series, seedsByBracket, placement: {} };
  save();
}

function simSeries(s) {
  const home = teamById(s.homeId), away = teamById(s.awayId);
  const need = Math.ceil(s.bestOf / 2);
  while (s.homeWins < need && s.awayWins < need) {
    const r = simGame(home, away);
    s.games.push({ h: r.h, a: r.a });
    if (r.h > r.a) s.homeWins++; else s.awayWins++;
  }
  s.complete = true;
  if (s.homeWins > s.awayWins) { s.winnerId = s.homeId; s.loserId = s.awayId; } else { s.winnerId = s.awayId; s.loserId = s.homeId; }
}

function simAllPending() { S.playoffs.series.forEach(s => { if (!s.complete) simSeries(s); }); save(); }

// All Cup advancement — implements the 7 scenarios.
// For each side: (TopA,TopB,LowA,LowB) plus DoD(LowA vs LowB).
// Compute WC + SF M1/M2 based on number of top-4 losers.
function advanceAllCupQF() {
  const po = S.playoffs;
  ['Gemini', 'ChatGPT'].forEach(b => {
    const seeds = po.seedsByBracket[b]; if (!seeds) return;
    const mains = po.series.filter(s => s.round === 'QF-Main' && s.id.startsWith(b));
    const dods = po.series.filter(s => s.round === 'QF-DoD' && s.id.startsWith(b));
    if (mains.some(s => !s.complete) || dods.some(s => !s.complete)) return;
    if (po.series.some(s => s.round === 'QF-WC' && s.id.startsWith(b))) return;
    // sides
    const sides = [1, 2].map(side => {
      const sm = mains.filter(m => m.side === side);
      const dod = dods.find(d => d.side === side);
      const topA = sm[0].id.endsWith('M1') || sm[0].id.endsWith('M3') ? sm[0] : sm[1];
      const topB = sm[0] === topA ? sm[1] : sm[0];
      // Determine top-seed winners/losers per main
      const evalMain = (m) => {
        const top = seeds.indexOf(m.homeId) < seeds.indexOf(m.awayId) ? m.homeId : m.awayId;
        const low = top === m.homeId ? m.awayId : m.homeId;
        const topWon = m.winnerId === top;
        return { top, low, topWon };
      };
      const a = evalMain(topA), c = evalMain(topB);
      const losers = [a, c].filter(x => !x.topWon).map(x => x.top);
      const winners = [a, c].filter(x => x.topWon).map(x => x.top);
      return { side, topA, topB, dod, losers, winners, a, c };
    });
    sides.forEach(S0 => {
      const idx = S0.side, dod = S0.dod;
      if (S0.losers.length === 0) {
        // Scenario 1: WC is rematch LowA vs LowB (DoD pairing), default-style.
        po.series.push(mkSeries(`${b}-QF-WC${idx}`, 'QF-WC', 'Wild Card',
          `[${b}] WC ${idx} — ${teamById(dod.homeId).name} vs ${teamById(dod.awayId).name}`,
          dod.homeId, dod.awayId, 5, { sideRef: idx, fwcKind: 'wcWinner' }));
      } else if (S0.losers.length === 1) {
        // Scenarios 3,5,6,7: WC = top-4 loser vs DoD winner; FWC contribution = WC loser.
        po.series.push(mkSeries(`${b}-QF-WC${idx}`, 'QF-WC', 'Wild Card',
          `[${b}] WC ${idx} — ${teamById(S0.losers[0]).name} vs ${teamById(dod.winnerId).name}`,
          S0.losers[0], dod.winnerId, 5, { sideRef: idx, fwcKind: 'wcLoser' }));
      } else {
        // Scenarios 2,7-side: both top-4 lost. Default WC: TopA vs TopB (both advance to SF). FWC contribution = DoD winner.
        const m = mkSeries(`${b}-QF-WC${idx}`, 'QF-WC', 'Wild Card',
          `[${b}] WC ${idx} (Default) — ${teamById(S0.a.top).name} vs ${teamById(S0.c.top).name}`,
          S0.a.top, S0.c.top, 5, { sideRef: idx, fwcKind: 'dodWinner', defaultBoth: true });
        // Auto-complete: both advance — pick home as nominal winner for SF; FWC uses dodWinner anyway.
        m.complete = true; m.winnerId = S0.a.top; m.loserId = S0.c.top; m.bye = true;
        po.series.push(m);
      }
    });
  });
  save();
}

function advanceAllCupSF() {
  const po = S.playoffs;
  ['Gemini', 'ChatGPT'].forEach(b => {
    const wcs = po.series.filter(s => s.round === 'QF-WC' && s.id.startsWith(b));
    if (wcs.length < 2 || wcs.some(s => !s.complete)) return;
    if (po.series.some(s => s.round === 'SF' && s.id.startsWith(b))) return;
    const mains = po.series.filter(s => s.round === 'QF-Main' && s.id.startsWith(b));
    const dods = po.series.filter(s => s.round === 'QF-DoD' && s.id.startsWith(b));
    const seeds = po.seedsByBracket[b];
    // For each side, derive the two SF M1/M2 participants
    function sfPairFor(side) {
      const sm = mains.filter(m => m.side === side);
      const wc = wcs.find(w => w.sideRef === side);
      const topsWon = sm.filter(m => seeds.indexOf(m.winnerId) < 4);
      if (wc.defaultBoth) {
        // Both top-4 lost → SF is TopA vs TopB (both advanced via default WC)
        return [wc.homeId, wc.awayId];
      } else if (topsWon.length === 2) {
        // No top loss → SF is the two top-seed winners (1v4 or 2v3)
        return [topsWon[0].winnerId, topsWon[1].winnerId];
      } else {
        // 1 top loss → SF is the surviving top + WC winner
        return [topsWon[0].winnerId, wc.winnerId];
      }
    }
    function fwcContrib(side) {
      const wc = wcs.find(w => w.sideRef === side);
      const dod = dods.find(d => d.side === side);
      if (wc.fwcKind === 'wcWinner') return wc.winnerId;
      if (wc.fwcKind === 'wcLoser') return wc.loserId;
      return dod.winnerId; // dodWinner
    }
    const [p1a, p1b] = sfPairFor(1);
    const [p2a, p2b] = sfPairFor(2);
    po.series.push(mkSeries(`${b}-SF-M1`, 'SF', 'Main', `[${b}] SF Match 1`, p1a, p1b, 7, { slot: 'M1' }));
    po.series.push(mkSeries(`${b}-SF-M2`, 'SF', 'Main', `[${b}] SF Match 2`, p2a, p2b, 7, { slot: 'M2' }));
    const f1 = fwcContrib(1), f2 = fwcContrib(2);
    po.series.push(mkSeries(`${b}-SF-M3`, 'SF', 'Final Wild Card', `[${b}] SF Match 3 (FWC)`, f1, f2, 7, { slot: 'M3' }));
  });
  if (po.series.some(s => s.round === 'SF')) po.round = 'SF';
  save();
}

function advanceAllCupF4() {
  const po = S.playoffs;
  ['Gemini', 'ChatGPT'].forEach(b => {
    const sfs = po.series.filter(s => s.round === 'SF' && s.id.startsWith(b));
    const m1 = sfs.find(s => s.slot === 'M1'), m2 = sfs.find(s => s.slot === 'M2'), m3 = sfs.find(s => s.slot === 'M3');
    if (!m1 || !m2 || !m3 || !m1.complete || !m2.complete || !m3.complete) return;
    if (!po.series.some(s => s.id === `${b}-SF-M4`)) {
      po.series.push(mkSeries(`${b}-SF-M4`, 'SF', 'Losers Consolation', `[${b}] SF Match 4 (M1L vs M2L)`, m1.loserId, m2.loserId, 7, { slot: 'M4' }));
      save(); return;
    }
    const m4 = po.series.find(s => s.id === `${b}-SF-M4`); if (!m4.complete) return;
    if (!po.series.some(s => s.id === `${b}-SF-M5`)) {
      po.series.push(mkSeries(`${b}-SF-M5`, 'SF', 'Final Wild Card', `[${b}] SF Match 5 (M4L vs M3W)`, m4.loserId, m3.winnerId, 7, { slot: 'M5' }));
      save(); return;
    }
    const m5 = po.series.find(s => s.id === `${b}-SF-M5`); if (!m5.complete) return;
    if (po.series.some(s => s.round === 'F4' && s.id.startsWith(b))) return;
    po.series.push(mkSeries(`${b}-F4-M1`, 'F4', 'Final Four', `[${b}] Final Four — M1W vs M5W`, m1.winnerId, m5.winnerId, 9));
    po.series.push(mkSeries(`${b}-F4-M2`, 'F4', 'Final Four', `[${b}] Final Four — M2W vs M4W`, m2.winnerId, m4.winnerId, 9));
  });
  if (po.series.some(s => s.round === 'F4')) po.round = 'F4';
  save();
}

function advanceAllCupCF() {
  const po = S.playoffs;
  ['Gemini', 'ChatGPT'].forEach(b => {
    const f4 = po.series.filter(s => s.round === 'F4' && s.id.startsWith(b));
    if (f4.length < 2 || f4.some(s => !s.complete)) return;
    if (po.series.some(s => s.round === 'CF' && s.id.startsWith(b))) return;
    po.series.push(mkSeries(`${b}-CF`, 'CF', 'Conference Finals', `[${b}] Conference Finals`, f4[0].winnerId, f4[1].winnerId, 15));
  });
  if (po.series.some(s => s.round === 'CF')) po.round = 'CF';
  save();
}

function advanceAllCupGF() {
  const po = S.playoffs;
  const cfs = po.series.filter(s => s.round === 'CF');
  if (cfs.length < 2 || cfs.some(s => !s.complete)) return;
  if (po.series.some(s => s.round === 'GF')) return;
  po.series.push(mkSeries('GF', 'GF', 'Grand Finals', '🏆 Grand Finals (Race to 15)', cfs[0].winnerId, cfs[1].winnerId, 29));
  po.round = 'GF'; save();
}

function advanceClusterPO() {
  const po = S.playoffs;
  const rds = [['R16', 'QF', 'Quarterfinals', 5], ['QF', 'SF', 'Semifinals', 5], ['SF', 'GF', 'Grand Finals', 7]];
  for (const [from, to, label, bo] of rds) {
    const cur = po.series.filter(s => s.round === from);
    if (!cur.length || cur.some(s => !s.complete)) break;
    if (po.series.some(s => s.round === to)) continue;
    const winners = cur.map(s => s.winnerId);
    for (let i = 0; i < winners.length; i += 2) {
      if (!winners[i + 1]) break;
      const id = `CC-${to}-${i / 2 + 1}`;
      po.series.push(mkSeries(id, to, label, `${label} Match ${i / 2 + 1}`, winners[i], winners[i + 1], bo));
    }
    po.round = to;
  }
  save();
}

function advanceBracketCupPO() {
  const po = S.playoffs;
  ['Gemini', 'ChatGPT'].forEach(b => {
    const rds = [['BC-QF', 'BC-SF', 'Semifinals'], ['BC-SF', 'BC-F', 'Bracket Final']];
    for (const [from, to, label] of rds) {
      const cur = po.series.filter(s => s.round === from && s.id.startsWith(b));
      if (!cur.length || cur.some(s => !s.complete)) break;
      if (po.series.some(s => s.round === to && s.id.startsWith(b))) continue;
      const winners = cur.map(s => s.winnerId);
      for (let i = 0; i < winners.length; i += 2) {
        if (!winners[i + 1]) break;
        po.series.push(mkSeries(`${b}-${to}-${i / 2 + 1}`, to, label, `[${b}] ${label} ${i / 2 + 1}`, winners[i], winners[i + 1], 7));
      }
    }
  });
  // Grand Finals once both bracket champions decided
  const gFin = po.series.find(s => s.round === 'BC-F' && s.id.startsWith('Gemini'));
  const cFin = po.series.find(s => s.round === 'BC-F' && s.id.startsWith('ChatGPT'));
  if (gFin && cFin && gFin.complete && cFin.complete && !po.series.some(s => s.round === 'GF')) {
    po.series.push(mkSeries('GF', 'GF', 'Grand Finals', '🏆 Bracket Cup Grand Finals', gFin.winnerId, cFin.winnerId, 7));
    po.round = 'GF';
  }
  save();
}

function autoAdvance() {
  if (!S.playoffs) return;
  if (S.playoffs.mode === 'AllCup') { advanceAllCupQF(); advanceAllCupSF(); advanceAllCupF4(); advanceAllCupCF(); advanceAllCupGF(); }
  else if (S.playoffs.mode === 'Cluster') advanceClusterPO();
  else if (S.playoffs.mode === 'BracketCup') advanceBracketCupPO();
}

// Compute placement rankings (1, 2, 3-4, 5-8, ...) based on round eliminated
function computePlacements() {
  const po = S.playoffs; if (!po) return {};
  const placement = {};
  const gf = po.series.find(s => s.round === 'GF');
  if (gf && gf.complete) { placement[gf.winnerId] = 1; placement[gf.loserId] = 2; }
  // For All Cup: CF losers tied 3-4; F4 losers 5-8; SF losers 9-12; QF losers 13-16
  if (po.mode === 'AllCup') {
    const tiers = [['CF', '3-4'], ['F4', '5-8'], ['SF', '9-12'], ['QF-WC', '13-16'], ['QF-DoD', '13-16'], ['QF-Main', '13-16']];
    tiers.forEach(([r, lbl]) => {
      po.series.filter(s => s.round === r && s.complete && !s.bye).forEach(s => {
        if (!(s.loserId in placement)) placement[s.loserId] = lbl;
      });
    });
  } else if (po.mode === 'Cluster') {
    const tiers = [['SF', '3-4'], ['QF', '5-8'], ['R16', '9-16']];
    tiers.forEach(([r, lbl]) => po.series.filter(s => s.round === r && s.complete).forEach(s => { if (!(s.loserId in placement)) placement[s.loserId] = lbl; }));
  } else if (po.mode === 'BracketCup') {
    const tiers = [['BC-F', '3-4'], ['BC-SF', '5-8'], ['BC-QF', '9-16']];
    tiers.forEach(([r, lbl]) => po.series.filter(s => s.round === r && s.complete).forEach(s => { if (!(s.loserId in placement)) placement[s.loserId] = lbl; }));
  }
  return placement;
}

function finalizeSeason() {
  const po = S.playoffs;
  const gf = po && po.series.find(s => s.round === 'GF' && s.complete);
  if (!gf) { alert('Grand Finals not complete.'); return; }
  const championId = gf.winnerId, runnerUpId = gf.loserId;

  let st, leaderboard, poLeaderboard;
  if (S.cup === 'Bracket Cup') {
    st = [...bracketCupStandings('Gemini'), ...bracketCupStandings('ChatGPT')].sort((a, b) => b.w - a.w || b.pf - a.pf);
  } else {
    st = standings();
  }
  const rsChampId = st[0].team.id;
  const pf = {};
  S.schedule.forEach(g => { if (g.played) { pf[g.homeId] = (pf[g.homeId] || 0) + g.homeScore; pf[g.awayId] = (pf[g.awayId] || 0) + g.awayScore; } });
  const scoreLeaderId = Object.entries(pf).sort((a, b) => b[1] - a[1])[0][0];
  const ppf = {};
  po.series.forEach(s => s.games.forEach(g => { ppf[s.homeId] = (ppf[s.homeId] || 0) + g.h; ppf[s.awayId] = (ppf[s.awayId] || 0) + g.a; }));
  const poScoreLeaderId = Object.entries(ppf).sort((a, b) => b[1] - a[1])[0][0];
  const placement = computePlacements();

  const record = {
    season: S.season, cup: S.cup, championId, runnerUpId, rsChampId, scoreLeaderId, poScoreLeaderId,
    rsChampRecord: `${st[0].w}-${st[0].l}`, scoreLeaderPts: pf[scoreLeaderId], poScoreLeaderPts: ppf[poScoreLeaderId],
    standings: st.map(r => ({ id: r.team.id, w: r.w, l: r.l, pf: r.pf, pa: r.pa })),
    leaderboard: Object.entries(pf).sort((a, b) => b[1] - a[1]).map(([id, pts]) => ({ id, pts })),
    poLeaderboard: Object.entries(ppf).sort((a, b) => b[1] - a[1]).map(([id, pts]) => ({ id, pts })),
    placement,
    schedule: JSON.parse(JSON.stringify(S.schedule)),
    playoffs: JSON.parse(JSON.stringify(S.playoffs))
  };
  S.history.push(record);
  S.awards.push(
    { season: S.season, cup: S.cup, type: 'Champion', teamId: championId },
    { season: S.season, cup: S.cup, type: 'Runner-Up', teamId: runnerUpId },
    { season: S.season, cup: S.cup, type: 'Regular Season Champion', teamId: rsChampId },
    { season: S.season, cup: S.cup, type: 'Scoring Leader', teamId: scoreLeaderId, extra: pf[scoreLeaderId] + ' pts' },
    { season: S.season, cup: S.cup, type: 'Playoffs Scoring Leader', teamId: poScoreLeaderId, extra: ppf[poScoreLeaderId] + ' pts' }
  );
  S.pendingChampion = { teamId: championId, cup: S.cup, season: S.season };
  const i = CUPS.indexOf(S.cup);
  if (i < CUPS.length - 1) S.cup = CUPS[i + 1]; else { S.cup = 'All Cup'; S.season++; }
  if (S.cup === 'Cluster Cup') reshuffleGroups();
  S.schedule = []; S.bracketCupSeries = []; S.playoffs = null;
  save();
  showChampionAnimation();
}
function reshuffleGroups() {
  const shuffled = shuffle(S.teams.map(t => t.id));
  shuffled.forEach((id, idx) => { const t = teamById(id); if (t) t.group = GROUPS[idx % 6]; });
}

function showChampionAnimation() {
  const pc = S.pendingChampion; if (!pc) return;
  const t = teamById(pc.teamId);
  const confetti = Array.from({ length: 80 }).map((_, i) => `<div class="confetti" style="left:${Math.random() * 100}%;background:${PALETTE[i % PALETTE.length]};animation-delay:${Math.random() * 1.2}s;animation-duration:${2 + Math.random() * 2}s"></div>`).join('');
  showModal(`<div class="champ-overlay">
    ${confetti}
    <div class="champ-trophy">🏆</div>
    <div class="champ-cup">Season ${pc.season} · ${pc.cup}</div>
    <div class="champ-name" style="color:${t.color}">${t.name}</div>
    <div class="champ-sub">CHAMPIONS</div>
    <button class="btn" style="margin-top:24px" onclick="dismissChampion()">Continue →</button>
  </div>`);
}
function dismissChampion() { S.pendingChampion = null; save(); closeModal(); go('#home'); render(); }

// ============ NAV ============
const ROUTES = [['home', 'Home'], ['teams', 'Teams'], ['schedule', 'Schedule'], ['standings', 'Standings'], ['leaderboards', 'Leaderboards'], ['power', 'Power Rankings'], ['playoffs', 'Playoffs'], ['awards', 'Awards'], ['history', 'History'], ['rules', 'Rules']];
function buildNav() { $('#nav').innerHTML = ROUTES.map(([id, label]) => `<a href="#${id}" data-route="${id}">${label}</a>`).join(''); }
function setActive() { const h = (location.hash || '#home').slice(1).split('/')[0]; document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.route === h)); }
function go(hash) { location.hash = hash }

// ============ VIEWS ============
function teamChip(id) { const t = teamById(id); if (!t) return '<span class="muted">—</span>'; return `<button class="team-chip" onclick="go('#team/${t.id}')"><span class="swatch" style="background:${t.color}"></span>${t.name}</button>`; }

function viewHome() {
  const n = S.teams.length;
  const reg = S.schedule;
  const played = reg.filter(g => g.played).length;
  const total = reg.filter(g => !g.skipped).length;
  return `<div class="hero">
    <div class="muted">Season ${S.season}</div>
    <h1>${S.cup}</h1>
    <p class="muted">${n}+ teams. ${S.cup === 'Cluster Cup' ? 'Six groups, knockout shuffle, one champion.' : S.cup === 'Bracket Cup' ? 'Per-bracket series league. Two bracket champs clash in the Finals.' : 'Two brackets. One champion.'} </p>
    <div class="row" style="margin-top:18px">
      ${S.ownerMode ? `
        ${!S.schedule.length ? `<button class="btn" onclick="actGenSchedule()">Generate Regular Season</button>` : ''}
        ${S.schedule.length && played < total ? `<button class="btn ghost" onclick="actSimAll()">Sim All Regular Season</button>` : ''}
        ${played >= total && total > 0 && !S.playoffs ? `<button class="btn" onclick="actGenPlayoffs()">Generate Playoffs</button>` : ''}
        <button class="btn ghost" onclick="openBulkAdd()">＋ Bulk Add Teams</button>
        <button class="btn danger" onclick="if(confirm('Reset everything?'))reset()">Reset All</button>
      `: '<span class="muted">Enable Owner Mode to manage the league.</span>'}
    </div>
  </div>
  <div class="grid g4" style="margin-top:18px">
    <div class="stat"><div class="l">Teams</div><div class="v">${n}</div></div>
    <div class="stat"><div class="l">Games Played</div><div class="v">${played} / ${total || '—'}</div></div>
    <div class="stat"><div class="l">Current Cup</div><div class="v" style="font-size:18px">${S.cup}</div></div>
    <div class="stat"><div class="l">Mode</div><div class="v" style="font-size:16px">${S.playoffs ? 'Playoffs' : 'Regular Season'}</div></div>
  </div>`;
}

function viewTeams() {
  return `<h1>Teams (${S.teams.length})</h1>
    <p class="muted">Click any team to view their profile, attributes, and awards.</p>
    <div class="grid g4" style="margin-top:14px">
      ${S.teams.map(t => `<div class="card" style="cursor:pointer;border-top:4px solid ${t.color}" onclick="go('#team/${t.id}')">
        <div style="font-weight:800;font-size:16px">${t.name}</div>
        <div class="muted" style="font-size:11px;margin-top:4px">${t.bracket} · Group ${t.group} · OVR ${overall(t)}</div>
      </div>`).join('')}
    </div>`;
}

let teamFilter = { awSeason: 'All', awCup: 'All', hSeason: 'All', hCup: 'All' };
function viewTeam(id) {
  const t = teamById(id); if (!t) return '<div class="empty">Team not found</div>';
  const allAwards = S.awards.filter(a => a.teamId === id);
  const awSeasons = ['All', ...new Set(allAwards.map(a => a.season))];
  const awCups = ['All', ...CUPS];
  const awards = allAwards.filter(a => (teamFilter.awSeason === 'All' || String(a.season) === String(teamFilter.awSeason)) && (teamFilter.awCup === 'All' || a.cup === teamFilter.awCup));
  const hSeasons = ['All', ...new Set(S.history.map(h => h.season))];
  const hCups = ['All', ...CUPS];
  const past = S.history.filter(h => h.standings.find(s => s.id === id)).filter(h => (teamFilter.hSeason === 'All' || String(h.season) === String(teamFilter.hSeason)) && (teamFilter.hCup === 'All' || h.cup === teamFilter.hCup));
  const pastCard = (h) => {
    const inSt = h.standings.find(s => s.id === id);
    const rank = h.standings.findIndex(s => s.id === id) + 1;
    // bracket place: recompute from standings (filter same bracket)
    const sameBracket = h.standings.filter(s => { const tt = teamById(s.id); return tt && tt.bracket === t.bracket; });
    const bp = sameBracket.findIndex(s => s.id === id) + 1;
    const place = h.placement && h.placement[id];
    const poPts = (h.poLeaderboard || []).find(r => r.id === id);
    const poLine = place ? `Playoffs: Place ${place}${poPts ? ` · ${poPts.pts} pts` : ''}` : `Playoffs: Did not qualify`;
    return `<div class="card" style="cursor:pointer" onclick="openTeamSeason('${id}',${h.season},'${h.cup}')">
      <div class="muted" style="font-size:11px">S${h.season} · ${h.cup}</div>
      <div style="font-weight:700;margin-top:4px">Overall #${rank} · Bracket #${bp}</div>
      <div class="muted" style="font-size:12px">${inSt.w}-${inSt.l} · ${inSt.pf} TP</div>
      <div style="font-size:12px;margin-top:6px;${place ? 'color:var(--good)' : 'color:var(--muted)'}">${poLine}</div>
      <div class="muted" style="font-size:10px;margin-top:8px">Click for full leaderboards →</div>
    </div>`;
  };
  return `<div class="card" style="border-top:6px solid ${t.color}">
    <div class="row"><div><h1>${t.name}</h1><div class="muted">${t.bracket} Bracket · Group ${t.group} · Overall ${overall(t)}</div></div>
      <div class="spacer"></div>
      ${S.ownerMode ? `<button class="btn ghost" onclick="openEditTeam('${t.id}')">Edit</button>` : ''}
    </div>
    <div class="attr-grid">${ATTRS.map(a => `<div class="attr"><div><div style="text-transform:capitalize">${a}</div><div class="bar"><i style="width:${t.attrs[a]}%"></i></div></div><b>${t.attrs[a]}</b></div>`).join('')}</div>
  </div>
  <h2>Awards (${awards.length}/${allAwards.length})</h2>
  <div class="row" style="margin-bottom:10px">
    <label class="muted">Season</label><select onchange="teamFilter.awSeason=this.value;render()">${awSeasons.map(s => `<option ${String(s) === String(teamFilter.awSeason) ? 'selected' : ''}>${s}</option>`).join('')}</select>
    <label class="muted">Cup</label><select onchange="teamFilter.awCup=this.value;render()">${awCups.map(c => `<option ${c === teamFilter.awCup ? 'selected' : ''}>${c}</option>`).join('')}</select>
  </div>
  ${awards.length ? `<div class="grid g3">${awards.map(a => `<div class="award-card"><div class="a-cup">S${a.season} · ${a.cup}</div><div class="a-type">🏆 ${a.type}</div>${a.extra ? `<div class="muted" style="font-size:11px;margin-top:4px">${a.extra}</div>` : ''}</div>`).join('')}</div>` : `<div class="empty">No awards for this filter.</div>`}
  <h2>Past Seasons (${past.length})</h2>
  <div class="row" style="margin-bottom:10px">
    <label class="muted">Season</label><select onchange="teamFilter.hSeason=this.value;render()">${hSeasons.map(s => `<option ${String(s) === String(teamFilter.hSeason) ? 'selected' : ''}>${s}</option>`).join('')}</select>
    <label class="muted">Cup</label><select onchange="teamFilter.hCup=this.value;render()">${hCups.map(c => `<option ${c === teamFilter.hCup ? 'selected' : ''}>${c}</option>`).join('')}</select>
  </div>
  <div class="grid g3">${past.map(pastCard).join('') || '<div class="muted">No history yet.</div>'}</div>`;
}
function openTeamSeason(id, season, cup) {
  const h = S.history.find(x => x.season === season && x.cup === cup); if (!h) return;
  const rank = h.standings.findIndex(s => s.id === id) + 1;
  const place = h.placement && h.placement[id];
  const rsLead = (h.leaderboard || []).findIndex(r => r.id === id) + 1;
  const poLead = (h.poLeaderboard || []).findIndex(r => r.id === id) + 1;
  const t = teamById(id);
  const list = (arr, key) => `<div style="max-height:280px;overflow:auto">${arr.map((r, i) => { const tt = teamById(r.id); if (!tt) return ''; const me = r.id === id ? 'background:rgba(255,122,0,.12)' : ''; return `<div class="row" style="padding:5px 0;border-bottom:1px solid var(--border);${me}"><div class="rank-num ${i < 3 ? 'r' + (i + 1) : ''}">${i + 1}</div><span class="swatch" style="background:${tt.color}"></span>${tt.name}<div class="spacer"></div><b>${r[key] ?? r.pts ?? ''}</b></div>` }).join('')}</div>`;
  showModal(`<h2 style="margin-top:0"><span class="swatch" style="background:${t.color}"></span>${t.name} — S${season} · ${cup}</h2>
    <div class="grid g4" style="margin:10px 0">
      <div class="stat"><div class="l">RS Overall</div><div class="v">#${rank}</div></div>
      <div class="stat"><div class="l">RS Scoring</div><div class="v">#${rsLead || '—'}</div></div>
      <div class="stat"><div class="l">Playoffs</div><div class="v">${place ? 'Place ' + place : 'DNQ'}</div></div>
      <div class="stat"><div class="l">PO Scoring</div><div class="v">#${poLead || '—'}</div></div>
    </div>
    <h3>Regular Season Standings</h3>${list(h.standings.map(s => ({ ...s, val: `${s.w}-${s.l} · ${s.pf} TP` })), 'val')}
    <h3>Regular Season Scoring</h3>${list(h.leaderboard || [])}
    <h3>Playoffs Scoring</h3>${list(h.poLeaderboard || [])}
    <div style="margin-top:14px"><button class="btn ghost" onclick="closeModal()">Close</button></div>`);
}

function viewSchedule() {
  if (!S.schedule.length) return `<div class="empty"><h2>No schedule</h2><p>${S.ownerMode ? 'Generate the regular season from Home.' : 'Owner needs to generate the season.'}</p></div>`;
  // BRACKET CUP — series-per-container
  if (S.cup === 'Bracket Cup') {
    const played = S.schedule.filter(g => g.played).length;
    const tot = S.schedule.filter(g => !g.skipped).length;
    const seriesByBracket = { Gemini: [], ChatGPT: [] };
    S.bracketCupSeries.forEach(s => seriesByBracket[s.bracket].push(s));
    return `<h1>Schedule & Results</h1>
      <div class="muted">${S.cup} · ${played}/${tot} games played · ${S.bracketCupSeries.filter(s => s.complete).length}/${S.bracketCupSeries.length} series settled</div>
      ${S.ownerMode ? `<div class="row" style="margin:12px 0"><button class="btn" onclick="actSimAll()">Sim All Unplayed</button></div>` : ''}
      ${['Gemini', 'ChatGPT'].map(b => `<h2>${b} Bracket</h2><div class="bc-list">${seriesByBracket[b].map(s => {
      const h = teamById(s.homeId), a = teamById(s.awayId);
      const games = S.schedule.filter(g => g.seriesId === s.id).sort((x, y) => x.gameNo - y.gameNo);
      const lead = s.complete ? `✓ ${teamById(s.winnerId).name} wins ${Math.max(s.homeWins, s.awayWins)}-${Math.min(s.homeWins, s.awayWins)}` : s.homeWins > s.awayWins ? `${h.name} leads ${s.homeWins}-${s.awayWins}` : s.awayWins > s.homeWins ? `${a.name} leads ${s.awayWins}-${s.homeWins}` : `Series 0-0`;
      const gamePills = games.map(g => {
        if (g.skipped) return `<span class="bc-game skipped">G${g.gameNo} —</span>`;
        if (!g.played) return `<span class="bc-game pending" ${S.ownerMode ? `onclick="actSimGame('${g.day}','${g.homeId}','${g.awayId}',${g.gameNo})" style="cursor:pointer"` : ''}>G${g.gameNo} ${S.ownerMode ? '▶' : '·'}</span>`;
        const winLeft = g.homeScore > g.awayScore;
        return `<span class="bc-game played"><span class="g-no">G${g.gameNo}</span> <b class="${winLeft ? 'win' : ''}">${g.homeScore}</b>-<b class="${winLeft ? '' : 'win'}">${g.awayScore}</b></span>`;
      }).join('');
      return `<div class="bc-row ${s.complete ? 'done' : ''}">
          <div class="bc-teams"><span class="swatch" style="background:${h.color}"></span><b>${h.name}</b> <span class="muted">vs</span> <b>${a.name}</b><span class="swatch" style="background:${a.color}"></span></div>
          <div class="bc-score">${s.homeWins}<span class="muted">–</span>${s.awayWins}</div>
          <div class="bc-games">${gamePills}</div>
          <div class="bc-lead">${lead}</div>
        </div>`;
    }).join('')}</div>`).join('')}`;
  }
  // ALL CUP / CLUSTER CUP — day-by-day
  const days = {};
  const visible = S.schedule.filter(g => !g.skipped);
  visible.forEach(g => { (days[g.day] = days[g.day] || []).push(g) });
  return `<h1>Schedule & Results</h1>
    <div class="muted">${S.cup} · ${visible.filter(g => g.played).length}/${visible.length} played</div>
    ${S.ownerMode ? `<div class="row" style="margin:12px 0"><button class="btn" onclick="actSimAll()">Sim All Unplayed</button></div>` : ''}
    <div class="grid g3" style="margin-top:14px">
    ${Object.keys(days).sort((a, b) => a - b).map(d => {
    const list = days[d];
    return `<div class="day-card"><div class="day-head">DAY ${d}${list[0].group ? ` · GROUP ${list[0].group}` : ''}</div>
        ${list.map((g) => {
      const h = teamById(g.homeId), a = teamById(g.awayId);
      const hw = g.played && g.homeScore > g.awayScore, aw = g.played && g.awayScore > g.homeScore;
      return `<div class="day-row">
            <div class="home"><span class="${hw ? 'winner' : ''}">${h.name}</span> <span class="swatch" style="background:${h.color}"></span></div>
            <div class="score ${g.played ? 'played' : ''}">${g.played ? `${g.homeScore}-${g.awayScore}` : 'vs'}</div>
            <div class="away"><span class="swatch" style="background:${a.color}"></span> <span class="${aw ? 'winner' : ''}">${a.name}</span></div>
            ${S.ownerMode ? `<div style="grid-column:1/-1;text-align:center;padding:2px 0">${!g.played ? `<button class="btn sm" onclick="actSimGame('${g.day}','${g.homeId}','${g.awayId}',0)">Sim</button>` : ''} <button class="btn sm ghost" onclick="actEditGame('${g.day}','${g.homeId}','${g.awayId}',0)">Edit</button></div>` : ''}
          </div>`;
    }).join('')}
      </div>`;
  }).join('')}</div>`;
}

function viewStandings() {
  if (S.cup === 'Bracket Cup') {
    const overallBC = [...bracketCupStandings('Gemini'), ...bracketCupStandings('ChatGPT')].sort((a, b) => b.w - a.w || b.pf - a.pf);
    const renderBC = (rows, tagFn) => `<div class="card"><table>
      <tr><th>#</th><th>Team</th><th>Bracket</th><th>Series W</th><th>Series L</th><th>TP</th><th>OP</th><th>Status</th></tr>
      ${rows.map((r, i) => `<tr><td><b>${i + 1}</b></td><td>${teamChip(r.team.id)}</td><td>${r.team.bracket}</td><td>${r.w}</td><td>${r.l}</td><td>${r.pf}</td><td>${r.pa}</td><td>${tagFn(i, r)}</td></tr>`).join('')}
    </table></div>`;
    const bcTag = (i) => i < 8 ? '<span class="tag blue">Playoff Secured</span>' : '';
    return `<h1>Standings — Bracket Cup</h1>
      <h2>Overall</h2>${renderBC(overallBC, () => '')}
      <h2>Gemini Bracket</h2>${renderBC(bracketCupStandings('Gemini'), bcTag)}
      <h2>ChatGPT Bracket</h2>${renderBC(bracketCupStandings('ChatGPT'), bcTag)}`;
  }
  if (S.cup === 'Cluster Cup') {
    // compute who clinched Top16 (top2 per group) and Top16 Qualifier (best 4 across 3rd-placers)
    const top16 = new Set(); const thirds = [];
    GROUPS.forEach(g => { const teams = S.teams.filter(t => t.group === g); const games = S.schedule.filter(x => x.group === g); const st = standings(games, teams); if (st[0]) top16.add(st[0].team.id); if (st[1]) top16.add(st[1].team.id); if (st[2]) thirds.push(st[2]); if (st[3]) thirds.push(st[3]); });
    thirds.sort((a, b) => b.w - a.w || b.pf - a.pf);
    const qualifiers = new Set(thirds.slice(0, 4).map(r => r.team.id));
    const overallSt = standings();
    const statusFor = (id) => top16.has(id) ? '<span class="tag green">Top 16</span>' : qualifiers.has(id) ? '<span class="tag blue">Top 16 Qualifier</span>' : '';
    const overallTable = `<div class="card"><table>
      <tr><th>#</th><th>Team</th><th>Group</th><th>W</th><th>L</th><th>TP</th><th>OP</th><th>Status</th></tr>
      ${overallSt.map((r, i) => `<tr><td><b>${i + 1}</b></td><td>${teamChip(r.team.id)}</td><td>${r.team.group}</td><td>${r.w}</td><td>${r.l}</td><td>${r.pf}</td><td>${r.pa}</td><td>${statusFor(r.team.id)}</td></tr>`).join('')}
    </table></div>`;
    return `<h1>Standings — Cluster Cup</h1>
      <h2>Overall</h2>${overallTable}
      ${GROUPS.map(g => {
      const teams = S.teams.filter(t => t.group === g);
      const games = S.schedule.filter(x => x.group === g);
      const st = standings(games, teams);
      return `<h2>Group ${g}</h2><div class="card"><table>
          <tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>PF</th><th>OP</th><th>Status</th></tr>
          ${st.map((r, i) => `<tr><td><b>${i + 1}</b></td><td>${teamChip(r.team.id)}</td><td>${r.w}</td><td>${r.l}</td><td>${r.pf}</td><td>${r.pa}</td><td>${statusFor(r.team.id)}</td></tr>`).join('')}
        </table></div>`;
    }).join('')}`;
  }
  // All Cup: bracket tables use ALL games (general), but rows filtered by bracket. Add bracket-place column to overall.
  const overallSt = standings();
  const bracketPlace = {};
  ['Gemini', 'ChatGPT'].forEach(b => {
    const st = standings(S.schedule, S.teams.filter(t => t.bracket === b));
    st.forEach((r, i) => bracketPlace[r.team.id] = { place: i + 1, bracket: b });
  });
  const overallTable = `<div class="card"><table>
    <tr><th>#</th><th>Team</th><th>Bracket</th><th>Bracket Place</th><th>W</th><th>L</th><th>TP</th><th>OP</th><th>Status</th></tr>
    ${overallSt.map((r, i) => {
    const bp = bracketPlace[r.team.id];
    let tag = ''; if (bp.place <= 4) tag = '<span class="tag green">Top 4 Secured</span>'; else if (bp.place <= 8) tag = '<span class="tag blue">Playoff Secured</span>';
    return `<tr><td><b>${i + 1}</b></td><td>${teamChip(r.team.id)}</td><td>${bp.bracket}</td><td>#${bp.place}</td><td>${r.w}</td><td>${r.l}</td><td>${r.pf}</td><td>${r.pa}</td><td>${tag}</td></tr>`;
  }).join('')}
  </table></div>`;
  const bracketTable = (b) => {
    const st = standings(S.schedule, S.teams.filter(t => t.bracket === b));
    return `<div class="card"><table>
      <tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>TP</th><th>OP</th><th>Status</th></tr>
      ${st.map((r, i) => `<tr><td><b>${i + 1}</b></td><td>${teamChip(r.team.id)}</td><td>${r.w}</td><td>${r.l}</td><td>${r.pf}</td><td>${r.pa}</td><td>${i < 4 ? '<span class="tag green">Top 4 Secured</span>' : i < 8 ? '<span class="tag blue">Playoff Secured</span>' : ''}</td></tr>`).join('')}
    </table></div>`;
  };
  return `<h1>Standings — All Cup</h1>
    <p class="muted">All 23 games count toward each table. Bracket tables show only that bracket's teams ranked by their full record.</p>
    <h2>Overall</h2>${overallTable}
    <h2>Gemini Bracket</h2>${bracketTable('Gemini')}
    <h2>ChatGPT Bracket</h2>${bracketTable('ChatGPT')}`;
}

function rankedPoints(games = S.schedule, teams = S.teams) {
  const pf = {}; teams.forEach(t => pf[t.id] = 0);
  games.forEach(g => {
    if (g.played) {
      if (pf[g.homeId] !== undefined) pf[g.homeId] += g.homeScore;
      if (pf[g.awayId] !== undefined) pf[g.awayId] += g.awayScore;
    }
  });
  return Object.entries(pf).map(([id, pts]) => ({ team: teamById(id), pts })).sort((a, b) => b.pts - a.pts);
}

function viewLeaderboards() {
  const all = rankedPoints();
  const list = (arr) => `<div class="card">${arr.map((r, i) => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--border)"><div class="rank-num ${i < 3 ? 'r' + (i + 1) : ''}">${i + 1}</div>${teamChip(r.team.id)}<div class="spacer"></div><b>${r.pts}</b><span class="muted" style="font-size:11px">pts</span></div>`).join('')}</div>`;
  let html = `<h1>Leaderboards — Total Points (${S.cup})</h1><h2>Overall</h2>${list(all)}`;
  if (S.cup === 'All Cup' || S.cup === 'Bracket Cup') {
    ['Gemini', 'ChatGPT'].forEach(b => {
      const teams = S.teams.filter(t => t.bracket === b);
      const g = S.schedule.filter(x => { const h = teamById(x.homeId); return h && h.bracket === b; });
      html += `<h2>${b} Bracket</h2>${list(rankedPoints(S.schedule, teams))}`;
    });
  } else if (S.cup === 'Cluster Cup') {
    GROUPS.forEach(g => {
      const teams = S.teams.filter(t => t.group === g);
      const games = S.schedule.filter(x => x.group === g);
      html += `<h2>Group ${g}</h2>${list(rankedPoints(S.schedule, teams))}`;
    });
  }
  return html;
}


function powerRows(teams, games) {
  const st = (S.cup === 'Bracket Cup') ? null : standings(games, teams);
  const recMap = {};
  if (st) st.forEach(r => recMap[r.team.id] = { w: r.w, l: r.l });
  else {
    // Bracket Cup: use series wins/losses
    teams.forEach(t => recMap[t.id] = { w: 0, l: 0 });
    S.bracketCupSeries.filter(s => s.complete && teams.find(t => t.id === s.homeId)).forEach(s => {
      if (s.winnerId === s.homeId) { recMap[s.homeId].w++; recMap[s.awayId].l++; } else { recMap[s.awayId].w++; recMap[s.homeId].l++; }
    });
  }
  return teams.map(t => {
    const ovr = overall(t);
    const r = recMap[t.id] || { w: 0, l: 0 };
    const wp = (r.w + r.l) > 0 ? r.w / (r.w + r.l) : 0;
    const rating = Math.round(ovr * 0.6 + wp * 100 * 0.4);
    return { team: t, ovr, wins: r.w, losses: r.l, rating };
  }).sort((a, b) => b.rating - a.rating || b.ovr - a.ovr);
}
function powerList(rows) {
  return `<div class="card pwr-list">${rows.map((r, i) => `<div class="pwr-row"><div class="rank-num ${i < 3 ? 'r' + (i + 1) : ''}">${i + 1}</div><span class="swatch" style="background:${r.team.color}"></span><button class="pwr-name" onclick="go('#team/${r.team.id}')">${r.team.name}</button><div class="spacer"></div><span class="muted pwr-rec">${r.wins}-${r.losses}</span><span class="muted pwr-ovr">OVR ${r.ovr}</span><b class="pwr-rating">${r.rating}</b></div>`).join('')}</div>`;
}

function viewPower() {
  let html = `<h1>Power Rankings</h1><p class="muted">60% team overall · 40% current win percentage.</p>`;
  html += `<h2>Overall</h2>${powerList(powerRows(S.teams, S.schedule))}`;

  if (S.cup === 'Cluster Cup') {
    GROUPS.forEach(g => {
      const teams = S.teams.filter(t => t.group === g);
      const games = S.schedule.filter(x => x.group === g);
      html += `<h2>Group ${g}</h2>${powerList(powerRows(teams, games))}`;
    });
  } else {
    // For All Cup / Bracket Cup, rank bracket teams by their full schedule
    ['Gemini', 'ChatGPT'].forEach(b => {
      const teams = S.teams.filter(t => t.bracket === b);
      html += `<h2>${b} Bracket</h2>${powerList(powerRows(teams, S.schedule))}`;
    });
  }

  return html;
}

function seriesCard(s) {
  const home = teamById(s.homeId), away = teamById(s.awayId);
  if (!home || !away) return '';
  const need = Math.ceil(s.bestOf / 2);
  const lead = s.complete
    ? (s.bye ? 'Bye (auto-advance)' : `✓ ${teamById(s.winnerId).name} wins the series ${Math.max(s.homeWins, s.awayWins)}-${Math.min(s.homeWins, s.awayWins)}`)
    : s.homeWins > s.awayWins ? `${home.name} leads ${s.homeWins}-${s.awayWins}`
      : s.awayWins > s.homeWins ? `${away.name} leads ${s.awayWins}-${s.homeWins}`
        : `Tied ${s.homeWins}-${s.awayWins}`;
  const gamesList = s.games.length ? `<div class="series-games">${s.games.map((g, i) => `<span class="g-pill">G${i + 1}: ${g.h}-${g.a}</span>`).join('')}</div>` : '';
  return `<div class="series">
    <div class="series-label">${s.label} · Bo${s.bestOf}</div>
    <div class="series-row ${s.complete && s.winnerId === s.homeId ? 'lead' : ''}"><div><span class="swatch" style="background:${home.color}"></span>${home.name}</div><div class="w">${s.homeWins}</div></div>
    <div class="series-row ${s.complete && s.winnerId === s.awayId ? 'lead' : ''}"><div><span class="swatch" style="background:${away.color}"></span>${away.name}</div><div class="w">${s.awayWins}</div></div>
    <div class="series-meta">${lead} (first to ${need})${s.games.length ? ` · ${s.games.length} game${s.games.length > 1 ? 's' : ''} played` : ''}</div>
    ${gamesList}
    ${S.ownerMode ? `<div class="row" style="margin-top:8px;gap:6px">
      ${!s.complete ? `<button class="btn sm" onclick="actSimNextGame('${s.id}')">Sim Next Game</button>` : ''}
      ${!s.complete ? `<button class="btn sm ghost" onclick="actSimSeries('${s.id}')">Sim Series</button>` : ''}
      <button class="btn sm ghost" onclick="actEditSeries('${s.id}')">Edit Wins</button>
    </div>`: ''}
  </div>`;
}

function viewPlayoffs() {
  if (!S.playoffs) return `<div class="empty"><h2>Playoffs not started</h2><p>${S.ownerMode ? 'Complete the regular season and generate playoffs from Home.' : 'Owner needs to generate the playoffs.'}</p></div>`;
  const po = S.playoffs;
  let html = `<h1>Playoffs — ${S.cup}</h1>
    <p class="muted">Current round: <b>${po.round}</b> · Mode: ${po.mode}</p>
    ${S.ownerMode ? `<div class="row" style="margin:10px 0"><button class="btn" onclick="actSimAllPO()">Sim All Pending</button> <button class="btn ghost" onclick="actAutoAdvance()">Auto-Advance</button> ${po.series.some(s => s.round === 'GF' && s.complete) ? `<button class="btn" onclick="finalizeSeason()">Finalize Season →</button>` : ''}</div>` : ''}`;

  if (po.mode === 'AllCup') {
    ['Gemini', 'ChatGPT'].forEach(b => {
      html += `<h2>${b} Bracket — Quarterfinals (Bo5)</h2>
        <div class="grid g3">
          <div class="po-col"><h3>Main</h3>${po.series.filter(s => s.round === 'QF-Main' && s.id.startsWith(b)).map(seriesCard).join('') || '<div class="muted">—</div>'}</div>
          <div class="po-col"><h3>Do or Die</h3>${po.series.filter(s => s.round === 'QF-DoD' && s.id.startsWith(b)).map(seriesCard).join('') || '<div class="muted">—</div>'}</div>
          <div class="po-col"><h3>Wild Card</h3>${po.series.filter(s => s.round === 'QF-WC' && s.id.startsWith(b)).map(seriesCard).join('') || '<div class="muted">Pending</div>'}</div>
        </div>`;
      const sf = po.series.filter(s => s.round === 'SF' && s.id.startsWith(b));
      if (sf.length) {
        const m = (slot) => sf.find(s => s.slot === slot);
        const upper = [m('M1'), m('M2'), m('M4')].filter(Boolean);
        const lower = [m('M3'), m('M5')].filter(Boolean);
        html += `<h2>${b} — Semifinals (Bo7)</h2><div class="grid g2"><div class="po-col"><h3>Upper Bracket</h3>${upper.map(seriesCard).join('')}</div><div class="po-col"><h3>Lower / Final Wild Card</h3>${lower.map(seriesCard).join('') || '<div class="muted">Pending M3/M5…</div>'}</div></div>`;
      }
      const f4 = po.series.filter(s => s.round === 'F4' && s.id.startsWith(b));
      if (f4.length) html += `<h2>${b} — Final Four (Bo9)</h2><div class="grid g2">${f4.map(s => `<div class="po-col">${seriesCard(s)}</div>`).join('')}</div>`;
      const cf = po.series.filter(s => s.round === 'CF' && s.id.startsWith(b));
      if (cf.length) html += `<h2>${b} — Conference Finals (Bo15)</h2>${cf.map(seriesCard).join('')}`;
    });
  } else if (po.mode === 'Cluster') {
    [['R16', 'Round of 16 (Bo3)'], ['QF', 'Quarterfinals (Bo5)'], ['SF', 'Semifinals (Bo5)']].forEach(([r, l]) => {
      const ms = po.series.filter(s => s.round === r);
      if (ms.length) html += `<h2>${l}</h2><div class="grid g3">${ms.map(s => `<div class="po-col">${seriesCard(s)}</div>`).join('')}</div>`;
    });
  } else if (po.mode === 'BracketCup') {
    ['Gemini', 'ChatGPT'].forEach(b => {
      [['BC-QF', 'Quarterfinals'], ['BC-SF', 'Semifinals'], ['BC-F', 'Bracket Final']].forEach(([r, l]) => {
        const ms = po.series.filter(s => s.round === r && s.id.startsWith(b));
        if (ms.length) html += `<h2>${b} — ${l} (Bo7)</h2><div class="grid g2">${ms.map(s => `<div class="po-col">${seriesCard(s)}</div>`).join('')}</div>`;
      });
    });
  }
  const gf = po.series.find(s => s.round === 'GF');
  if (gf) html += `<h2>🏆 Grand Finals</h2><div class="po-col" style="max-width:520px;margin:0 auto">${seriesCard(gf)}</div>`;

  // Results summary
  const completed = po.series.filter(s => s.complete);
  if (completed.length) {
    html += `<h2>Results</h2><div class="card">${completed.map(s => {
      const w = teamById(s.winnerId), l = s.loserId ? teamById(s.loserId) : null;
      if (!w) return '';
      return `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--border)"><span class="tag">${s.round}</span> <span class="swatch" style="background:${w.color}"></span><b>${w.name}</b> def. ${l ? `<span class="swatch" style="background:${l.color}"></span>${l.name}` : '—'} <div class="spacer"></div><span class="muted">${s.homeWins}-${s.awayWins}</span></div>`;
    }).join('')}</div>`;
  }
  return html;
}

const AWARD_TYPES = ['All', 'Champion', 'Runner-Up', 'Regular Season Champion', 'Scoring Leader', 'Playoffs Scoring Leader'];
let awardsFilter = { type: 'All', season: 'All', cup: 'All' };
function viewAwards() {
  const seasons = ['All', ...new Set(S.awards.map(a => a.season))];
  const cups = ['All', ...CUPS];
  const filtered = S.awards.filter(a => (awardsFilter.type === 'All' || a.type === awardsFilter.type) && (awardsFilter.season === 'All' || a.season == Number(awardsFilter.season)) && (awardsFilter.cup === 'All' || a.cup === awardsFilter.cup));
  return `<h1>Awards</h1>
    <div class="row" style="margin:14px 0">
      <label class="muted">Category</label><select onchange="awardsFilter.type=this.value;render()">${AWARD_TYPES.map(t => `<option ${t === awardsFilter.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <label class="muted">Season</label><select onchange="awardsFilter.season=this.value;render()">${seasons.map(s => `<option ${String(s) === String(awardsFilter.season) ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <label class="muted">Cup</label><select onchange="awardsFilter.cup=this.value;render()">${cups.map(c => `<option ${c === awardsFilter.cup ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <span class="muted">${filtered.length} award${filtered.length === 1 ? '' : 's'}</span>
    </div>
    ${filtered.length === 0 ? `<div class="empty">No awards yet for this filter. Finalize a season to crown winners.</div>` : `
    <div class="grid g3">${filtered.map(a => {
    const t = teamById(a.teamId); return `<div class="award-card" onclick="openRanking('${a.type}',${a.season},'${a.cup}')">
      <div class="a-cup">S${a.season} · ${a.cup}</div>
      <div class="a-type">🏆 ${a.type}</div>
      <div class="a-team"><span class="swatch" style="background:${t.color}"></span><b>${t.name}</b></div>
      ${a.extra ? `<div class="muted" style="font-size:11px;margin-top:4px">${a.extra}</div>` : ''}
      <div class="muted" style="font-size:10px;margin-top:8px">Click to see full ranking →</div>
    </div>`;
  }).join('')}</div>`}`;
}

function openRanking(type, season, cup) {
  const rec = S.history.find(h => h.season === season && h.cup === cup);
  if (!rec) { alert('No history record.'); return; }
  let rows = [], col = '';
  if (type === 'Champion' || type === 'Runner-Up') {
    // Playoff placement ranking: 1, 2, 3-4, 5-8 etc.
    const grouped = {};
    Object.entries(rec.placement || {}).forEach(([id, p]) => { (grouped[p] = grouped[p] || []).push(id) });
    const order = [1, 2, '3-4', '5-8', '9-12', '9-16', '13-16', '17-20', '21-24', '25-?'];
    order.forEach(p => { if (grouped[p]) grouped[p].forEach(id => rows.push({ id, val: `Place ${p}` })) });
    col = 'Playoff Placement';
  } else if (type === 'Regular Season Champion') {
    rows = rec.standings.map(r => ({ id: r.id, val: `${r.w}-${r.l} · ${r.pf} TP` })); col = 'Record';
  } else if (type === 'Scoring Leader') {
    rows = rec.leaderboard.map(r => ({ id: r.id, val: `${r.pts} pts` })); col = 'Total Points (Regular Season)';
  } else if (type === 'Playoffs Scoring Leader') {
    rows = rec.poLeaderboard.map(r => ({ id: r.id, val: `${r.pts} pts` })); col = 'Total Points (Playoffs)';
  }
  showModal(`<h2 style="margin-top:0">${type} — Full Ranking</h2>
    <div class="muted" style="margin-bottom:10px">Season ${season} · ${cup} · ${col}</div>
    <div style="max-height:60vh;overflow:auto">
    ${rows.map((r, i) => { const t = teamById(r.id); if (!t) return ''; return `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--border)"><div class="rank-num ${i < 3 ? 'r' + (i + 1) : ''}">${i + 1}</div><span class="swatch" style="background:${t.color}"></span><b>${t.name}</b><div class="spacer"></div><span>${r.val}</span></div>`; }).join('')}
    </div>
    <div style="margin-top:14px"><button class="btn ghost" onclick="closeModal()">Close</button></div>`);
}

let historyView = { season: null, cup: null, tab: 'overview' };
function viewHistory() {
  if (!S.history.length) return `<h1>History</h1><div class="empty">No seasons completed yet.</div>`;
  if (historyView.season == null) { historyView.season = S.history[S.history.length - 1].season; historyView.cup = S.history[S.history.length - 1].cup; }
  const rec = S.history.find(h => h.season === historyView.season && h.cup === historyView.cup) || S.history[0];
  const seasons = [...new Set(S.history.map(h => h.season))];
  return `<h1>History</h1>
    <div class="row">
      <label class="muted">Season</label><select onchange="historyView.season=Number(this.value);render()">${seasons.map(s => `<option value="${s}" ${s === historyView.season ? 'selected' : ''}>Season ${s}</option>`).join('')}</select>
      <label class="muted">Cup</label><select onchange="historyView.cup=this.value;render()">${S.history.filter(h => h.season === historyView.season).map(h => `<option value="${h.cup}" ${h.cup === historyView.cup ? 'selected' : ''}>${h.cup}</option>`).join('')}</select>
    </div>
    ${rec ? renderHistoryRecord(rec) : '<div class="empty">No record.</div>'}`;
}
function renderHistoryRecord(rec) {
  const champ = teamById(rec.championId), ru = teamById(rec.runnerUpId);
  return `<div class="card" style="margin-top:14px">
    <div class="muted">Season ${rec.season} · ${rec.cup}</div>
    <h2 style="margin-top:6px">🏆 ${champ.name}</h2>
    <div class="muted" style="font-size:12px">defeated <b>${ru.name}</b> in the Grand Finals</div>
    <div class="grid g3" style="margin-top:16px">
      <div class="stat"><div class="l">Regular Season Champion</div><div class="v" style="font-size:14px">${teamById(rec.rsChampId).name}</div><div class="muted" style="font-size:11px">${rec.rsChampRecord}</div></div>
      <div class="stat"><div class="l">Scoring Leader</div><div class="v" style="font-size:14px">${teamById(rec.scoreLeaderId).name}</div><div class="muted" style="font-size:11px">${rec.scoreLeaderPts} pts</div></div>
      <div class="stat"><div class="l">Playoffs Scoring Leader</div><div class="v" style="font-size:14px">${teamById(rec.poScoreLeaderId).name}</div><div class="muted" style="font-size:11px">${rec.poScoreLeaderPts} pts</div></div>
    </div>
    <div class="tabs" style="margin-top:18px">
      <div class="tab ${historyView.tab === 'overview' ? 'active' : ''}" onclick="historyView.tab='overview';render()">Final Standings</div>
      <div class="tab ${historyView.tab === 'schedule' ? 'active' : ''}" onclick="historyView.tab='schedule';render()">Regular Season</div>
      <div class="tab ${historyView.tab === 'playoffs' ? 'active' : ''}" onclick="historyView.tab='playoffs';render()">Playoffs Results</div>
      <div class="tab ${historyView.tab === 'leaders' ? 'active' : ''}" onclick="historyView.tab='leaders';render()">Leaderboards</div>
    </div>
    ${renderHistoryTab(rec)}
  </div>`;
}
function renderHistoryTab(rec) {
  if (historyView.tab === 'overview') return `<table><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>TP</th></tr>${rec.standings.map((r, i) => { const t = teamById(r.id); return `<tr><td>${i + 1}</td><td><span class="swatch" style="background:${t.color}"></span>${t.name}</td><td>${r.w}</td><td>${r.l}</td><td>${r.pf}</td></tr>`; }).join('')}</table>`;
  if (historyView.tab === 'schedule') { const days = {}; rec.schedule.filter(g => !g.skipped).forEach(g => { (days[g.day] = days[g.day] || []).push(g) }); return `<div class="grid g3" style="margin-top:10px">${Object.keys(days).sort((a, b) => a - b).map(d => `<div class="day-card"><div class="day-head">DAY ${d}</div>${days[d].map(g => { const h = teamById(g.homeId), a = teamById(g.awayId); return `<div class="day-row"><div class="home">${h.name}</div><div class="score played">${g.homeScore}-${g.awayScore}</div><div class="away">${a.name}</div></div>` }).join('')}</div>`).join('')}</div>`; }
  if (historyView.tab === 'playoffs') { if (!rec.playoffs) return '<div class="muted">No playoff data.</div>'; const rounds = [...new Set(rec.playoffs.series.map(s => s.round))]; return rounds.map(r => { const s = rec.playoffs.series.filter(x => x.round === r); if (!s.length) return ''; return `<h3>${r}</h3><div class="grid g2">${s.map(seriesCard).join('')}</div>` }).join(''); }
  if (historyView.tab === 'leaders') return `<div class="grid g2"><div><h3>Regular Season Scoring</h3>${rec.leaderboard.slice(0, 10).map((r, i) => { const t = teamById(r.id); return `<div class="row" style="padding:5px 0;border-bottom:1px solid var(--border)"><div class="rank-num ${i < 3 ? 'r' + (i + 1) : ''}">${i + 1}</div><span class="swatch" style="background:${t.color}"></span>${t.name}<div class="spacer"></div><b>${r.pts}</b></div>` }).join('')}</div><div><h3>Playoffs Scoring</h3>${rec.poLeaderboard.slice(0, 10).map((r, i) => { const t = teamById(r.id); return `<div class="row" style="padding:5px 0;border-bottom:1px solid var(--border)"><div class="rank-num ${i < 3 ? 'r' + (i + 1) : ''}">${i + 1}</div><span class="swatch" style="background:${t.color}"></span>${t.name}<div class="spacer"></div><b>${r.pts}</b></div>` }).join('')}</div></div>`;
}

function viewRules() {
  return `<h1>League Rules</h1>
    <div class="card"><h2 style="margin-top:0">All Cup</h2>
      <ul><li>Single round-robin (N-1 games per team).</li>
      <li>Two brackets (Gemini, ChatGPT). Bracket standings count all games.</li>
      <li><b>Quarterfinals (Bo5)</b> — Main: 1v8, 4v5, 2v7, 3v6. DoD: #8v#5, #7v#6 always plays.</li>
      <li>Wild Card: Top-4 losers vs DoD winners. If no Top-4 lost, DoD winners face each other in WC.</li>
      <li>Semifinals (Bo7) · Final Four (Bo9) · Conference Finals (Bo15) · Grand Finals (Race to 15).</li></ul>
    </div>
    <div class="card"><h2>Cluster Cup</h2>
      <ul><li>6 groups (A-F), 4 teams each. Round-robin within group only.</li>
      <li>Top 2 per group (12) + 4 best 3rd-place finishers by standings = 16 teams.</li>
      <li>Shuffled knockout: R16 (Bo3) → QF (Bo5) → SF (Bo5) → Grand Finals (Bo7).</li></ul>
    </div>
    <div class="card"><h2>Bracket Cup</h2>
      <ul><li>Each bracket plays its own round-robin in Best-of-3 series (N-1 series per team).</li>
      <li>Top 8 in each bracket → playoffs. All playoff series Bo7.</li>
      <li>Bracket champions meet in the Grand Finals (Bo7).</li></ul>
    </div>
    <div class="card"><h2>General</h2>
      <ul><li>All teams start with attributes at <b>75</b>.</li>
      <li>Standings tiebreaker: Wins → TP (Total Points).</li>
      <li>Owner Mode unlocks score editing, sim controls, and team management.</li></ul>
    </div>`;
}

// ============ MODAL ============
function showModal(html) { $('#modalCard').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

function openBulkAdd() {
  showModal(`<h2 style="margin-top:0">Bulk Add Teams</h2>
    <p class="muted">One team name per line. Brackets, groups, and colors auto-assigned.</p>
    <textarea id="bulkNames" rows="10" style="width:100%" placeholder="Falcons&#10;Wolves..."></textarea>
    <div class="row" style="margin-top:12px"><button class="btn" onclick="doBulkAdd()">Add Teams</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>`);
}
function doBulkAdd() {
  const names = $('#bulkNames').value.split('\n').map(s => s.trim()).filter(Boolean);
  if (!names.length) { closeModal(); return; }
  let gi = S.teams.filter(t => t.bracket === 'Gemini').length, ci = S.teams.filter(t => t.bracket === 'ChatGPT').length;
  names.forEach(n => {
    const bracket = gi <= ci ? 'Gemini' : 'ChatGPT';
    if (bracket === 'Gemini') gi++; else ci++;
    const group = GROUPS[S.teams.length % 6];
    S.teams.push({ id: 't' + (S.teams.length + Math.random().toString(36).slice(2, 6)), name: n, bracket, group, color: PALETTE[S.teams.length % PALETTE.length], attrs: Object.fromEntries(ATTRS.map(a => [a, 75])) });
  });
  save(); closeModal(); render();
}
function openEditTeam(id) {
  const t = teamById(id);
  showModal(`<h2 style="margin-top:0">Edit ${t.name}</h2>
    <label>Name<br><input class="input" id="eName" value="${t.name}" style="width:100%"></label><br><br>
    <label>Color<br><input class="input" id="eColor" type="color" value="${t.color}"></label>
    <label style="margin-left:14px">Bracket<select id="eBracket"><option ${t.bracket === 'Gemini' ? 'selected' : ''}>Gemini</option><option ${t.bracket === 'ChatGPT' ? 'selected' : ''}>ChatGPT</option></select></label>
    <label style="margin-left:14px">Group<select id="eGroup">${GROUPS.map(g => `<option ${t.group === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
    <h3>Attributes</h3>
    ${ATTRS.map(a => `<div class="row" style="margin:6px 0"><label style="width:120px;text-transform:capitalize">${a}</label><input class="input" id="ea-${a}" type="number" min="0" max="99" value="${t.attrs[a]}"></div>`).join('')}
    <div class="row" style="margin-top:14px"><button class="btn" onclick="doSaveTeam('${id}')">Save</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>`);
}
function doSaveTeam(id) {
  const t = teamById(id);
  t.name = $('#eName').value.trim() || t.name;
  t.color = $('#eColor').value;
  t.bracket = $('#eBracket').value;
  t.group = $('#eGroup').value;
  ATTRS.forEach(a => t.attrs[a] = Math.max(0, Math.min(99, Number($('#ea-' + a).value) || 75)));
  save(); closeModal(); render();
}

// ============ ACTIONS ============
function findGame(day, homeId, awayId, gameNo) { return S.schedule.find(g => String(g.day) === String(day) && g.homeId === homeId && g.awayId === awayId && (gameNo ? g.gameNo === gameNo : !g.gameNo)); }
function actGenSchedule() { generateSchedule(); render(); }
function actSimAll() { simAllRegular(); render(); }
function actSimGame(day, h, a, gn) { const g = findGame(day, h, a, gn); if (!g) return; const r = simGame(teamById(g.homeId), teamById(g.awayId)); g.homeScore = r.h; g.awayScore = r.a; g.played = true; if (g.seriesId) recordSeriesGame(g); save(); render(); }
function actEditGame(day, h, a, gn) { const g = findGame(day, h, a, gn); if (!g) return; const hs = prompt('Home score', g.homeScore ?? 0); if (hs === null) return; const as = prompt('Away score', g.awayScore ?? 0); if (as === null) return; g.homeScore = +hs; g.awayScore = +as; g.played = true; if (g.seriesId) { const s = S.bracketCupSeries.find(x => x.id === g.seriesId); if (s) { s.homeWins = 0; s.awayWins = 0; s.games = []; s.complete = false; s.winnerId = null; S.schedule.filter(x => x.seriesId === s.id).forEach(x => { x.skipped = false; if (x.played && x !== g) { s.games.push({ h: x.homeScore, a: x.awayScore, no: x.gameNo }); if (x.homeScore > x.awayScore) s.homeWins++; else s.awayWins++; } }); recordSeriesGame(g); } } save(); render(); }
function actGenPlayoffs() { generatePlayoffs(); render(); go('#playoffs'); }
function actSimSeries(id) { const s = S.playoffs.series.find(x => x.id === id); simSeries(s); autoAdvance(); save(); render(); }
function actSimNextGame(id) { const s = S.playoffs.series.find(x => x.id === id); if (!s || s.complete) return; const r = simGame(teamById(s.homeId), teamById(s.awayId)); s.games.push({ h: r.h, a: r.a }); if (r.h > r.a) s.homeWins++; else s.awayWins++; const need = Math.ceil(s.bestOf / 2); if (s.homeWins >= need || s.awayWins >= need) { s.complete = true; s.winnerId = s.homeWins > s.awayWins ? s.homeId : s.awayId; s.loserId = s.winnerId === s.homeId ? s.awayId : s.homeId; autoAdvance(); } save(); render(); }
function actSimAllPO() { simAllPending(); autoAdvance(); render(); }
function actAutoAdvance() { autoAdvance(); render(); }
function actEditSeries(id) { const s = S.playoffs.series.find(x => x.id === id); if (!s) return; const hw = prompt(`${teamById(s.homeId).name} wins`, s.homeWins); if (hw === null) return; const aw = prompt(`${teamById(s.awayId).name} wins`, s.awayWins); if (aw === null) return; s.homeWins = +hw; s.awayWins = +aw; const need = Math.ceil(s.bestOf / 2); if (s.homeWins >= need || s.awayWins >= need) { s.complete = true; s.winnerId = s.homeWins > s.awayWins ? s.homeId : s.awayId; s.loserId = s.winnerId === s.homeId ? s.awayId : s.homeId; } else { s.complete = false; s.winnerId = null; s.loserId = null; } autoAdvance(); save(); render(); }
function actAddSeriesGame(id) { const s = S.playoffs.series.find(x => x.id === id); if (!s || s.complete) return; const hs = prompt(`${teamById(s.homeId).name} score`, '100'); if (hs === null) return; const as = prompt(`${teamById(s.awayId).name} score`, '95'); if (as === null) return; s.games.push({ h: +hs, a: +as }); if (+hs > +as) s.homeWins++; else s.awayWins++; const need = Math.ceil(s.bestOf / 2); if (s.homeWins >= need || s.awayWins >= need) { s.complete = true; s.winnerId = s.homeWins > s.awayWins ? s.homeId : s.awayId; s.loserId = s.winnerId === s.homeId ? s.awayId : s.homeId; autoAdvance(); } save(); render(); }

// ============ RENDER ============
const VIEWS = { home: viewHome, teams: viewTeams, schedule: viewSchedule, standings: viewStandings, leaderboards: viewLeaderboards, power: viewPower, playoffs: viewPlayoffs, awards: viewAwards, history: viewHistory, rules: viewRules };
function maybeAutoOpenPlayoffs() {
  if (S.playoffs || !S.schedule.length) return;
  const visible = S.schedule.filter(g => !g.skipped);
  if (!visible.length || visible.some(g => !g.played)) return;
  generatePlayoffs(); save();
}
function render() {
  maybeAutoOpenPlayoffs();
  $('#seasonLabel').textContent = `Season ${S.season} — ${S.cup}`;
  $('#ownerBtn').textContent = S.ownerMode ? 'Owner: ON' : 'Owner Mode';
  $('#ownerBtn').classList.toggle('ghost', !S.ownerMode);
  setActive();
  const hash = (location.hash || '#home').slice(1);
  if (hash.startsWith('team/')) { $('#view').innerHTML = viewTeam(hash.slice(5)); return; }
  const v = VIEWS[hash] || viewHome;
  $('#view').innerHTML = v();
}
$('#ownerBtn').addEventListener('click', () => {
  if (!S.ownerMode) { const pw = prompt('Owner password:'); if (pw !== 'owner') { alert('Access Denied!'); return; } S.ownerMode = true; } else S.ownerMode = false;
  save(); render();
});
window.addEventListener('hashchange', render);
buildNav();
render();
if (S.pendingChampion) showChampionAnimation();

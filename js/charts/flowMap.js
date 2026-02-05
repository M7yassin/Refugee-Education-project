/* =========================================================
 * FLOW MAP (Responsive + no "zoomed in" look)
 * - Uses dataset country names for UI labels (prevents SSD -> South Korea confusion).
 * - Map names used only for geometry/coords.
 * ========================================================= */

window.renderFlowMap = async function () {
  const container = d3.select('#chart-flowmap');
  if (container.empty()) return;

  // -----------------------------
  // Kill previous timers/observers
  // -----------------------------
  if (window.__flowMapTimer) {
    clearInterval(window.__flowMapTimer);
    window.__flowMapTimer = null;
  }
  if (window.__flowMapRO) {
    try { window.__flowMapRO.disconnect(); } catch (e) {}
    window.__flowMapRO = null;
  }

  // Preserve last state across rerenders
  window.__flowMapState = window.__flowMapState || { index: 0, playing: true };
  const savedState = window.__flowMapState;

  // Guard against async overlap
  const runId = (window.__flowMapRunId = (window.__flowMapRunId || 0) + 1);

  // Clear container
  container.html('');

  // -----------------------------
  // Layout 
  // -----------------------------
  const rect = container.node().getBoundingClientRect();
  const width = Math.max(320, rect.width || 1000);
  const isNarrow = width < 640;

  // Responsive height 
  const height = Math.round(
    Math.max(420, Math.min(720, width * (isNarrow ? 0.9 : 0.62)))
  );

  // Padding reserved for overlay elements
  const padTop = isNarrow ? 72 : 78;      // title/subtitle zone
  const padBottom = isNarrow ? 110 : 125; // controls zone
  const padSide = isNarrow ? 16 : 24;

  // --------
  // SVG 
  // ----------
  const svg = container.append('svg')
    .attr('class', 'flowmap-svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const mapLayer = svg.append('g').attr('class', 'map-layer');
  const linksLayer = svg.append('g').attr('class', 'links-layer');
  const nodesLayer = svg.append('g').attr('class', 'nodes-layer');
  const overlayLayer = svg.append('g').attr('class', 'overlay-layer');

  // ----------
  // Controls 
  // ----------
  const controlsContainer = container.append('div')
    .attr('class', 'flow-controls');

  const playBtn = controlsContainer.append('button')
    .attr('class', 'flow-play')
    .html(savedState.playing ? '❚❚' : '▶');

  const slider = controlsContainer.append('input')
    .attr('class', 'flow-slider')
    .attr('type', 'range');

  const yearDisplay = controlsContainer.append('span')
    .attr('class', 'flow-year')
    .text('Loading...');

  // --------
  // Tooltip 
  // ----------
  let tooltip = d3.select('#global-tooltip');
  if (tooltip.empty()) tooltip = d3.select('body').append('div').attr('id', 'global-tooltip');
  tooltip.style('opacity', 0);

  // -------------
  // Arrow marker
  // ---------------
  const defs = svg.append('defs');
  defs.append('marker')
    .attr('id', 'arrowHead')
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 9)
    .attr('refY', 5)
    .attr('markerUnits', 'strokeWidth')
    .attr('markerWidth', 3)
    .attr('markerHeight', 3)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M 0 0 L 10 5 L 0 10 z')
    .attr('fill', '#D4A84B');

  // ---------
  // Helpers
  // ------------
  function pickKey(obj, candidates) {
    for (const k of candidates) if (k in obj) return k;
    return null;
  }

  function normalizeName(s) {
    if (!s) return '';
    return String(s)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\(.*?\)/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function levenshtein(a, b) {
    a = a || ''; b = b || '';
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[m][n];
  }

  const ISO3_OVERRIDES = {
    COD: 'Democratic Republic of the Congo',
    COG: 'Republic of the Congo',
    CIV: "Côte d'Ivoire",
    RUS: 'Russia',
    IRN: 'Iran',
    SYR: 'Syria',
    KOR: 'South Korea',
    PRK: 'North Korea',
    LAO: 'Laos',
    BOL: 'Bolivia',
    VEN: 'Venezuela',
    GBR: 'United Kingdom',
    USA: 'United States of America',
    TZA: 'United Republic of Tanzania',
    VNM: 'Vietnam',
    TUR: 'Turkey',
    SSD: 'South Sudan'
  };

  const fmtK = (n) => {
    if (!n || n <= 0) return '0';
    if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return `${Math.round(n)}`;
  };

  const fmtNum = (n) => (window.formatNum ? window.formatNum(n) : (n ?? 0).toLocaleString());

  try {
    if (typeof topojson === 'undefined') {
      container.html(`<div style="color:#ff6b6b;padding:20px">
        Error: topojson is not defined. Include TopoJSON script in index.html.
      </div>`);
      return;
    }

    // --------------
    // Load world map 
    // --------------
    window.__world110mPromise = window.__world110mPromise ||
      d3.json('https://unpkg.com/world-atlas@2.0.2/countries-110m.json');

    const worldData = await window.__world110mPromise;

    // If a newer render started while awaiting, abort this one
    if (runId !== window.__flowMapRunId) return;

    const countries = topojson.feature(worldData, worldData.objects.countries);

    // --------
    // Projection
    // ----------
    const projection = d3.geoNaturalEarth1();
    projection.fitExtent(
      [[padSide, padTop], [width - padSide, height - padBottom]],
      countries
    );

    const geoPath = d3.geoPath().projection(projection);

    // Base map paths
    mapLayer.selectAll('path')
      .data(countries.features)
      .enter().append('path')
      .attr('d', geoPath);

    const worldNames = countries.features
      .map(f => f?.properties?.name)
      .filter(Boolean);

    const worldIndex = new Map(); // normalized -> actual name
    worldNames.forEach(nm => worldIndex.set(normalizeName(nm), nm));

    const coordsByWorldName = new Map();
    countries.features.forEach(f => {
      const nm = f?.properties?.name;
      if (!nm) return;
      coordsByWorldName.set(nm, geoPath.centroid(f));
    });

    // -----------------------------
    // Load data from AppData
    // -----------------------------
    const demo = window.AppData?.demographics || [];
    if (!demo.length) {
      container.html('<div style="color:#fff;padding:20px">No demographics data loaded.</div>');
      return;
    }

    const sample = demo[0] || {};

    const KEY_YEAR = pickKey(sample, ['year', 'Year']);
    const KEY_O_CODE = pickKey(sample, ['originCode', 'Country of Origin Code', 'countryOriginCode']);
    const KEY_O_NAME = pickKey(sample, ['originName', 'Country of Origin Name', 'countryOriginName']);
    const KEY_A_CODE = pickKey(sample, ['asylumCode', 'Country of Asylum Code', 'countryAsylumCode']);
    const KEY_A_NAME = pickKey(sample, ['asylumName', 'Country of Asylum Name', 'countryAsylumName']);

    const KEY_F_5_11 = pickKey(sample, ['female511', 'Female 5-11']);
    const KEY_M_5_11 = pickKey(sample, ['male511', 'Male 5-11']);
    const KEY_F_12_17 = pickKey(sample, ['female1217', 'Female 12-17']);
    const KEY_M_12_17 = pickKey(sample, ['male1217', 'Male 12-17']);

    if (!KEY_YEAR || !KEY_O_CODE || !KEY_O_NAME || !KEY_A_CODE || !KEY_A_NAME || !KEY_F_5_11 || !KEY_M_5_11 || !KEY_F_12_17 || !KEY_M_12_17) {
      container.html(`<div style="color:#ff6b6b;padding:20px">
        Error: Could not detect required fields in demographics data.
      </div>`);
      return;
    }

    const years = [...new Set(demo.map(d => +d[KEY_YEAR]))].sort((a, b) => a - b);
    slider.attr('min', 0).attr('max', years.length - 1);

    // Clamp saved index if dataset changed
    savedState.index = Math.max(0, Math.min(savedState.index, years.length - 1));
    slider.property('value', savedState.index);

    // -----------------------------
    // Resolve ISO3 -> world name -> coords
    // -----------------------------
    const uniqueCodes = new Map(); // ISO3 -> {name}
    demo.forEach(d => {
      const oc = d[KEY_O_CODE], on = d[KEY_O_NAME];
      const ac = d[KEY_A_CODE], an = d[KEY_A_NAME];
      if (oc && on && !uniqueCodes.has(oc)) uniqueCodes.set(oc, { name: on });
      if (ac && an && !uniqueCodes.has(ac)) uniqueCodes.set(ac, { name: an });
    });

    // Keep dataset names for UI labels
    const rawNameByISO3 = new Map();
    for (const [iso3, info] of uniqueCodes.entries()) rawNameByISO3.set(iso3, info.name);

    function resolveWorldNameByISO3(iso3, rawName) {
      if (iso3 === 'SSD') {
        const candidates = ['South Sudan', 'S. Sudan', 'S Sudan'];
        for (const nm of candidates) {
          const hit = worldIndex.get(normalizeName(nm));
          if (hit) return hit;
        }
      }

      if (ISO3_OVERRIDES[iso3]) {
        const wanted = ISO3_OVERRIDES[iso3];
        const normWanted = normalizeName(wanted);
        if (worldIndex.has(normWanted)) return worldIndex.get(normWanted);
      }

      const norm = normalizeName(rawName);
      if (worldIndex.has(norm)) return worldIndex.get(norm);

      const simplified = norm
        .replace(/\brep\b|\brepublic\b/g, '')
        .replace(/\bislamic\b|\bstate\b|\bplurinational\b|\bbolivarian\b/g, '')
        .replace(/\bof\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (worldIndex.has(simplified)) return worldIndex.get(simplified);

      const token = simplified.split(' ')[0] || simplified;
      let best = null;
      let bestScore = Infinity;

      for (const nm of worldNames) {
        const w = normalizeName(nm);
        if (token && !w.includes(token)) continue;
        const dist = levenshtein(simplified, w);
        if (dist < bestScore) { bestScore = dist; best = nm; }
      }

      if (best && bestScore <= 6) return best;
      return null;
    }

    const coordsByISO3 = new Map();
    const displayNameByISO3 = new Map(); 

    for (const [iso3, info] of uniqueCodes.entries()) {
      const wName = resolveWorldNameByISO3(iso3, info.name);
      if (!wName || !coordsByWorldName.has(wName)) continue;
      coordsByISO3.set(iso3, coordsByWorldName.get(wName));
      displayNameByISO3.set(iso3, wName);
    }

    // -----------------------------
    // Overlay UI 
    // -----------------------------
    const titleY = isNarrow ? 30 : 34;
    const subtitleY = isNarrow ? 48 : 52;

    overlayLayer.append('text')
      .attr('class', 'flow-title')
      .attr('x', width / 2)
      .attr('y', titleY)
      .attr('text-anchor', 'middle')
      .text('Top Host Countries (Stable Set, 2010–2024)');

    overlayLayer.append('text')
      .attr('class', 'flow-subtitle')
      .attr('x', width / 2)
      .attr('y', subtitleY)
      .attr('text-anchor', 'middle')
      .text('Hover a host to reveal origin flows and top origins (5–17)');

    // Summary box 
    const summaryW = Math.round(Math.min(380, Math.max(260, width * 0.42)));
    const summaryH = 70;
    const summaryX = padSide;
    const summaryY = 14;

    const summaryG = overlayLayer.append('g');
    summaryG.append('rect')
      .attr('class', 'flow-summary-bg')
      .attr('x', summaryX).attr('y', summaryY)
      .attr('rx', 10).attr('ry', 10)
      .attr('width', summaryW).attr('height', summaryH);

    const summaryLine1 = summaryG.append('text')
      .attr('class', 'flow-summary-title')
      .attr('x', summaryX + 14).attr('y', summaryY + 28)
      .text('Hover a host');

    const summaryLine2 = summaryG.append('text')
      .attr('class', 'flow-summary-sub')
      .attr('x', summaryX + 14).attr('y', summaryY + 50)
      .text('to see top origins + inflow');

    // Side panel
    const panelW = Math.round(Math.min(360, Math.max(260, width * (isNarrow ? 0.58 : 0.34))));
    const panelH = isNarrow ? 210 : 250;
    const panelX = summaryX;
    const panelY = Math.max(
      padTop + 10,
      height - panelH - (isNarrow ? 120 : 140)
    );

    const panel = overlayLayer.append('g');

    panel.append('rect')
      .attr('class', 'flow-panel-bg')
      .attr('x', panelX).attr('y', panelY)
      .attr('rx', 12).attr('ry', 12)
      .attr('width', panelW).attr('height', panelH);

    panel.append('text')
      .attr('class', 'flow-panel-title')
      .attr('x', panelX + 14).attr('y', panelY + 26)
      .text('Top Origin Countries');

    const panelSub = panel.append('text')
      .attr('class', 'flow-panel-sub')
      .attr('x', panelX + 14).attr('y', panelY + 46)
      .text('Hover a host to populate');

    const barsG = panel.append('g').attr('class', 'bars');

    // -----------------------------
    // Compute stable Top Hosts
    // -----------------------------
    const hostTotalsAllYears = new Map();

    demo.forEach(d => {
      const total =
        (+d[KEY_F_5_11] || 0) + (+d[KEY_M_5_11] || 0) +
        (+d[KEY_F_12_17] || 0) + (+d[KEY_M_12_17] || 0);

      if (total <= 0) return;

      const o = d[KEY_O_CODE];
      const a = d[KEY_A_CODE];
      if (!o || !a) return;
      if (o === a) return;
      if (!coordsByISO3.has(a)) return;

      hostTotalsAllYears.set(a, (hostTotalsAllYears.get(a) || 0) + total);
    });

    const TOP_N_HOSTS = 8;
    const stableTopHosts = [...hostTotalsAllYears.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, TOP_N_HOSTS)
      .map(([asylumISO3, totalAll]) => ({ asylumISO3, totalAll }));

    const stableHostSet = new Set(stableTopHosts.map(d => d.asylumISO3));

    // -----------------------------
    // Hover state
    // -----------------------------
    let currentFlowsByHost = new Map();
    let currentInflowByHost = new Map();
    let currentYearTotalStable = 0;

    function drawSidePanel(asylumISO3) {
      if (!asylumISO3) {
        panelSub.text('Hover a host to populate');
        barsG.selectAll('*').remove();
        return;
      }

      const hostName =
        rawNameByISO3.get(asylumISO3) ||
        displayNameByISO3.get(asylumISO3) ||
        asylumISO3;

      const inflow = currentInflowByHost.get(asylumISO3) || 0;

      const flowsRaw = currentFlowsByHost.get(asylumISO3) || [];
      const flows = flowsRaw
        .filter(d => d.value > 0 && d.share > 0.001)
        .slice(0, 5);

      if (!flows.length) {
        panelSub.text(`${hostName} • no origin breakdown for this year`);
        barsG.selectAll('*').remove();
        return;
      }

      panelSub.text(`${hostName} • ${fmtK(inflow)} children (year)`);

      const maxVal = d3.max(flows, d => d.value) || 1;
      const x = d3.scaleLinear()
        .domain([0, maxVal])
        .range([0, Math.max(110, panelW - 160)]);

      const rowH = 28;
      const startY = panelY + 64;

      const rows = barsG.selectAll('g.row')
        .data(flows, d => d.originISO3);

      rows.exit().remove();

      const rowsEnter = rows.enter().append('g').attr('class', 'row');

      rowsEnter.append('rect')
        .attr('class', 'flow-bar')
        .attr('rx', 6).attr('ry', 6)
        .attr('height', 18);

      rowsEnter.append('text')
        .attr('class', 'flow-bar-label')
        .attr('y', 14);

      rowsEnter.append('text')
        .attr('class', 'flow-bar-value')
        .attr('y', 14);

      const rowsAll = rowsEnter.merge(rows);
      rowsAll.attr('transform', (d, i) => `translate(${panelX + 14}, ${startY + i * rowH})`);

      rowsAll.select('rect.flow-bar')
        .attr('width', d => x(d.value));

      rowsAll.select('text.flow-bar-label')
        .attr('x', 0)
        .text(d => d.originName);

      rowsAll.select('text.flow-bar-value')
        .attr('x', panelW - 160)
        .text(d => `${fmtK(d.value)} • ${(d.share * 100).toFixed(1)}%`);
    }

    // -----------------------------
    // Update by year
    // -----------------------------
    const ORIGINS_PER_HOST = 5;

    function update(index) {
      const year = years[index];
      yearDisplay.text(String(year));
      slider.property('value', index);
      savedState.index = index;

      const inflow = new Map(stableTopHosts.map(h => [h.asylumISO3, 0]));
      const flowAgg = new Map(); // "o|a" -> total

      for (const d of demo) {
        if (+d[KEY_YEAR] !== year) continue;

        const total =
          (+d[KEY_F_5_11] || 0) + (+d[KEY_M_5_11] || 0) +
          (+d[KEY_F_12_17] || 0) + (+d[KEY_M_12_17] || 0);

        if (total <= 0) continue;

        const o = d[KEY_O_CODE];
        const a = d[KEY_A_CODE];
        if (!o || !a) continue;
        if (o === a) continue;
        if (!stableHostSet.has(a)) continue;
        if (!coordsByISO3.has(o) || !coordsByISO3.has(a)) continue;

        inflow.set(a, (inflow.get(a) || 0) + total);

        const key = `${o}|${a}`;
        flowAgg.set(key, (flowAgg.get(key) || 0) + total);
      }

      const hosts = stableTopHosts.map(h => ({
        asylumISO3: h.asylumISO3,
        inflow: inflow.get(h.asylumISO3) || 0
      }));

      currentYearTotalStable = d3.sum(hosts, d => d.inflow);
      currentInflowByHost = new Map(hosts.map(h => [h.asylumISO3, h.inflow]));

      const hostToFlows = new Map();
      for (const [key, value] of flowAgg.entries()) {
        const [o, a] = key.split('|');
        if (!hostToFlows.has(a)) hostToFlows.set(a, []);
        hostToFlows.get(a).push({ originISO3: o, asylumISO3: a, value });
      }

      currentFlowsByHost = new Map();
      const finalFlows = [];

      for (const h of hosts) {
        const arr = (hostToFlows.get(h.asylumISO3) || [])
          .sort((x, y) => y.value - x.value)
          .slice(0, ORIGINS_PER_HOST);

        const denom = h.inflow || 1;

        const cleaned = arr
          .filter(x => x.value > 0)
          .map(x => ({
            originISO3: x.originISO3,
            asylumISO3: x.asylumISO3,
            value: x.value,
            share: denom > 0 ? x.value / denom : 0,

            originName:
              rawNameByISO3.get(x.originISO3) ||
              displayNameByISO3.get(x.originISO3) ||
              x.originISO3,

            asylumName:
              rawNameByISO3.get(x.asylumISO3) ||
              displayNameByISO3.get(x.asylumISO3) ||
              x.asylumISO3
          }))
          .filter(x => x.share > 0.001);

        currentFlowsByHost.set(h.asylumISO3, cleaned);
        cleaned.forEach(x => finalFlows.push(x));
      }

      const maxHost = d3.max(hosts, d => d.inflow) || 1;
      const hostR = d3.scaleSqrt().domain([0, maxHost]).range([isNarrow ? 5 : 6, isNarrow ? 22 : 28]);

      const maxShare = d3.max(finalFlows, d => d.share) || 0.01;
      const flowW = d3.scaleLinear().domain([0, maxShare]).range([1, isNarrow ? 4 : 5]);

      // Links
      const linkSel = linksLayer.selectAll('path.flow-link')
        .data(finalFlows, d => `${d.originISO3}|${d.asylumISO3}`);

      linkSel.exit().remove();

      const linkEnter = linkSel.enter().append('path')
        .attr('class', 'flow-link')
        .attr('marker-end', 'url(#arrowHead)')
        .style('pointer-events', 'none');

      linkEnter.merge(linkSel)
        .style('pointer-events', 'none')
        .attr('stroke-width', d => flowW(d.share))
        .attr('d', d => {
          const s = coordsByISO3.get(d.originISO3);
          const t = coordsByISO3.get(d.asylumISO3);
          const dx = t[0] - s[0], dy = t[1] - s[1];
          const dr = Math.sqrt(dx * dx + dy * dy) * 1.25;
          return `M${s[0]},${s[1]}A${dr},${dr} 0 0,1 ${t[0]},${t[1]}`;
        })
        .style('opacity', 0.0);

      // Nodes
      const nodeSel = nodesLayer.selectAll('circle.host')
        .data(hosts, d => d.asylumISO3);

      nodeSel.exit().remove();

      const nodeEnter = nodeSel.enter().append('circle')
        .attr('class', 'host');

      nodeEnter.merge(nodeSel)
        .attr('cx', d => coordsByISO3.get(d.asylumISO3)[0])
        .attr('cy', d => coordsByISO3.get(d.asylumISO3)[1])
        .attr('r', d => hostR(d.inflow))
        .attr('opacity', d => (d.inflow > 0 ? 0.45 : 0.18));

      // Hover label
      const hoverLabel = overlayLayer.selectAll('text.hover-label').data([1]);
      hoverLabel.enter().append('text')
        .attr('class', 'hover-label')
        .style('opacity', 0);

      // Hover behavior
      nodesLayer.selectAll('circle.host')
        .on('mouseover', function (e, h) {
          const infl = h.inflow || 0;

          const hostName =
            rawNameByISO3.get(h.asylumISO3) ||
            displayNameByISO3.get(h.asylumISO3) ||
            h.asylumISO3;

          const shareStable = currentYearTotalStable > 0 ? (infl / currentYearTotalStable) : 0;

          summaryLine1.text(`${hostName} — ${fmtNum(infl)} children`);
          summaryLine2.text(`${(shareStable * 100).toFixed(1)}% of total inflow (stable hosts) in ${year}`);

          drawSidePanel(h.asylumISO3);

          linksLayer.selectAll('path.flow-link')
            .style('opacity', d => (d.asylumISO3 === h.asylumISO3 ? 0.85 : 0.0));

          nodesLayer.selectAll('circle.host')
            .style('opacity', d => (d.asylumISO3 === h.asylumISO3 ? 0.80 : 0.08));

          overlayLayer.select('text.hover-label')
            .attr('x', coordsByISO3.get(h.asylumISO3)[0] + hostR(h.inflow) + 6)
            .attr('y', coordsByISO3.get(h.asylumISO3)[1] + 4)
            .text(`${hostName} (${fmtK(infl)})`)
            .style('opacity', 1);

          tooltip.style('opacity', 0);
        })
        .on('mouseout', function () {
          summaryLine1.text('Hover a host');
          summaryLine2.text('to see top origins + inflow');

          drawSidePanel(null);

          linksLayer.selectAll('path.flow-link').style('opacity', 0.0);

          nodesLayer.selectAll('circle.host')
            .style('opacity', d => (d.inflow > 0 ? 0.45 : 0.18));

          overlayLayer.select('text.hover-label').style('opacity', 0);

          tooltip.style('opacity', 0);
        });
    }

    // -----------------------------
    // Engine (play/pause)
    // -----------------------------
    function startTimer() {
      if (window.__flowMapTimer) clearInterval(window.__flowMapTimer);
      window.__flowMapTimer = setInterval(() => {
        savedState.index = (savedState.index + 1) % years.length;
        update(savedState.index);
      }, 1500);

      playBtn.html('❚❚');
      savedState.playing = true;
    }

    function stopTimer() {
      if (window.__flowMapTimer) clearInterval(window.__flowMapTimer);
      window.__flowMapTimer = null;

      playBtn.html('▶');
      savedState.playing = false;
    }

    // Initial render at saved index
    update(savedState.index);
    if (savedState.playing) startTimer();
    else stopTimer();

    playBtn.on('click', () => {
      if (savedState.playing) stopTimer();
      else startTimer();
    });

    slider.on('input', function () {
      stopTimer();
      savedState.index = +this.value;
      update(savedState.index);
    });

    // --------------
    // ResizeObserver 
    // ----------------
    if (typeof ResizeObserver !== 'undefined') {
      let raf = 0;
      window.__flowMapLastW = window.__flowMapLastW || 0;

      window.__flowMapRO = new ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const w = container.node()?.getBoundingClientRect().width || 0;
          if (!w) return;
          if (Math.abs(w - window.__flowMapLastW) < 2) return;
          window.__flowMapLastW = w;
          window.renderFlowMap();
        });
      });

      window.__flowMapLastW = width;
      window.__flowMapRO.observe(container.node());
    }

  } catch (err) {
    console.error(err);
    container.html(`<div style="color:#ff6b6b;padding:20px">Error: ${err.message}</div>`);
  }
};

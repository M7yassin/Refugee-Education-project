/* =========================================================
 * Snapshot 2024: Teen Hosting vs OOS (Secondary-age)
 * ========================================================= */

window.renderResilienceBurdenScatter = function renderResilienceBurdenScatter() {
  const YEAR = 2024;

  const TOP_HOSTS = 15;
  const MAX_SHOW = 8;

  const IND_PRIMARY = 'SE.PRM.TENR';
  const IND_SECONDARY = 'SE.SEC.NENR';
  const IND_OOS_SEC = 'UIS.ROFST.SEC.BEST';

  const container = d3.select('#chart-resilience-scatter');
  const legend = d3.select('#legend-resilience');
  if (container.empty()) return;

  // ---- prevent stacking resize observers
  if (window.__scatterRO) {
    try { window.__scatterRO.disconnect(); } catch (e) {}
    window.__scatterRO = null;
  }

  container.selectAll('*').remove();
  legend.selectAll('*').remove();

  const proc = window.AppData?.processed;
  const edu = window.AppData?.education || [];

  if (!proc?.byYear?.[YEAR]?.byAsylum || !edu.length) {
    container.html('<div class="scatter-empty">Data not loaded.</div>');
    return;
  }

  // -----------------------------
  // Tooltip 
  // -----------------------------
  function ensureTip() {
    let el = document.getElementById('global-tooltip');
    if (!el) {
      el = document.createElement('div');
      el.id = 'global-tooltip';
      document.body.appendChild(el);
    }
    return el;
  }
  const tipEl = ensureTip();

  function showTip(e, html) {
    tipEl.innerHTML = html;
    tipEl.style.opacity = 1;

    const pad = 14;
    tipEl.style.left = (e.clientX + pad) + 'px';
    tipEl.style.top = (e.clientY - pad) + 'px';

    requestAnimationFrame(() => {
      const r = tipEl.getBoundingClientRect();
      if (r.right > window.innerWidth - 10) tipEl.style.left = (e.clientX - r.width - pad) + 'px';
      if (r.bottom > window.innerHeight - 10) tipEl.style.top = (e.clientY - r.height - pad) + 'px';
    });
  }

  function moveTip(e) {
    if (+tipEl.style.opacity !== 1) return;
    const pad = 14;
    tipEl.style.left = (e.clientX + pad) + 'px';
    tipEl.style.top = (e.clientY - pad) + 'px';
  }

  function hideTip() { tipEl.style.opacity = 0; }

  // -----------------------------
  // Helpers
  // -----------------------------
  function getNum(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = +v;
    return Number.isFinite(n) ? n : null;
  }

  const fmtNum = (v) => window.formatNum ? window.formatNum(v) : (+v).toLocaleString();
  const fmtPct = (v) => (v == null) ? '—' : `${(+v).toFixed(1)}%`;

  function escapeHtml(str) {
    return String(str ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function fmtKM(v) {
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return Math.round(v / 1e3) + 'K';
    return String(Math.round(v));
  }

  // -----------------------------
  // Education fast lookup: code|indicator -> row
  // -----------------------------
  const eduMap = new Map();
  for (const r of edu) {
    if (!r?.countryCode || !r?.indicatorCode) continue;
    eduMap.set(`${r.countryCode}|${r.indicatorCode}`, r);
  }

  function eduValue(code, indicator, year) {
    const row = eduMap.get(`${code}|${indicator}`);
    if (!row) return null;
    return getNum(row[String(year)]);
  }

  // -----------------------------
  // 1)  Top 15 hosts by school-age (5–17) in 2024
  // -----------------------------
  const byAsylum = proc.byYear[YEAR].byAsylum;
  const topHosts = Object.values(byAsylum)
    .filter(d => d && d.code && (d.total || 0) > 0)
    .sort((a, b) => (b.total || 0) - (a.total || 0))
    .slice(0, TOP_HOSTS)
    .map(d => ({
      code: d.code,
      name: d.name,
      burden517: d.total || 0,
      teen1217: d.secondary || 0
    }));

  if (!topHosts.length) {
    container.html(`<div class="scatter-empty">No host data for ${YEAR}.</div>`);
    return;
  }

  // -----------------------------
  // 2) Build SAME cliff subset 
  // -----------------------------
  const cliffEligible = [];
  for (const c of topHosts) {
    const p = eduValue(c.code, IND_PRIMARY, YEAR);
    const s = eduValue(c.code, IND_SECONDARY, YEAR);
    if (p != null && s != null) {
      const primary = Math.max(0, Math.min(105, p));
      const secondary = Math.max(0, Math.min(105, s));
      cliffEligible.push({ ...c, primary, secondary, drop: primary - secondary });
    }
  }

  if (!cliffEligible.length) {
    container.html(`<div class="scatter-empty">No cliff-compatible countries (missing enrollment data in ${YEAR}).</div>`);
    return;
  }

  cliffEligible.sort((a, b) => (b.drop - a.drop) || (b.burden517 - a.burden517));
  const cliffSubset = cliffEligible.slice(0, MAX_SHOW);

  // -----------------------------
  // 3) Plot only cliff subset that has OOS in 2024
  // -----------------------------
  const data = [];
  const missingOOS = [];

  for (const c of cliffSubset) {
    const oos = eduValue(c.code, IND_OOS_SEC, YEAR);
    if (oos == null) missingOOS.push(c);
    else data.push({ ...c, oos });
  }

  if (data.length < 3) {
    container.html(`<div class="scatter-empty">Too few cliff countries have OOS reported in ${YEAR} (${data.length}/${cliffSubset.length}).</div>`);
    return;
  }

  // -----------------------------
  // Thresholds: medians of plotted subset
  // -----------------------------
  const medTeen = d3.median(data, d => d.teen1217);
  const medOOS = d3.median(data, d => d.oos);

  data.forEach(d => {
    d.isPriority = (d.teen1217 >= medTeen) && (d.oos >= medOOS);
  });


  const rect = container.node().getBoundingClientRect();
  const width = Math.max(320, rect.width || 860);
  const isNarrow = width < 620;

  const height = isNarrow ? 440 : 560;

  const margin = {
    top: 18,
    right: 18,
    bottom: isNarrow ? 58 : 64,
    left: isNarrow ? 62 : 78
  };

  const w = width - margin.left - margin.right;
  const h = height - margin.top - margin.bottom;

  const svg = container.append('svg')
    .attr('class', 'scatter-svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMinYMin meet');

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const xMax = d3.max(data, d => d.teen1217) || 1;
  const yMax = d3.max(data, d => d.oos) || 1;

  const x = d3.scaleLinear()
    .domain([0, xMax * 1.08])
    .range([0, w])
    .nice();

  const y = d3.scaleLinear()
    .domain([0, Math.max(10, yMax * 1.15)])
    .range([h, 0])
    .nice();

  // Grid
  const gridG = g.append('g')
    .attr('class', 'scatter-grid');

  gridG.call(d3.axisLeft(y).ticks(6).tickSize(-w).tickFormat(''));
  gridG.selectAll('path').remove();

  // Axes
  g.append('g')
    .attr('class', 'scatter-axis scatter-x-axis')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(fmtKM));

  g.append('g')
    .attr('class', 'scatter-axis scatter-y-axis')
    .call(d3.axisLeft(y).ticks(6));

  // Axis labels
  g.append('text')
    .attr('class', 'scatter-axis-label scatter-x-label')
    .attr('x', w / 2)
    .attr('y', h + (isNarrow ? 44 : 48))
    .attr('text-anchor', 'middle')
    .text(`Hosted refugee adolescents (12–17) — ${YEAR}`);

  g.append('text')
    .attr('class', 'scatter-axis-label scatter-y-label')
    .attr('transform', 'rotate(-90)')
    .attr('x', -h / 2)
    .attr('y', isNarrow ? -46 : -58)
    .attr('text-anchor', 'middle')
    .text(`Out-of-school rate (secondary-age) — ${YEAR}`);

  // Priority zone (top-right)
  const xMedPx = x(medTeen);
  const yMedPx = y(medOOS);

  g.append('rect')
    .attr('class', 'scatter-priority-zone')
    .attr('x', xMedPx)
    .attr('y', 0)
    .attr('width', w - xMedPx)
    .attr('height', yMedPx);

  // Median lines
  g.append('line')
    .attr('class', 'scatter-median-line')
    .attr('x1', xMedPx).attr('x2', xMedPx)
    .attr('y1', 0).attr('y2', h);

  g.append('line')
    .attr('class', 'scatter-median-line')
    .attr('x1', 0).attr('x2', w)
    .attr('y1', yMedPx).attr('y2', yMedPx);

  // Median notes
  g.append('text')
    .attr('class', 'median-note')
    .attr('x', Math.min(w - 6, xMedPx + 6))
    .attr('y', h - 6)
    .attr('text-anchor', 'start')
    .text(`Median teen: ${fmtKM(Math.round(medTeen))}`);

  g.append('text')
    .attr('class', 'median-note')
    .attr('x', 6)
    .attr('y', Math.max(12, yMedPx - 6))
    .attr('text-anchor', 'start')
    .text(`Median OOS: ${medOOS.toFixed(1)}%`);

  // Point sizes
  const xMin = d3.min(data, d => d.teen1217) || 0;
  const r = d3.scaleSqrt()
    .domain([xMin, xMax])
    .range(isNarrow ? [9, 15] : [10, 18]);

  const accent = window.COLORS?.accent || '#D4A84B';
  const red = '#C62828';

  // Points
  g.append('g')
    .selectAll('circle.scatter-point')
    .data(data, d => d.code)
    .enter()
    .append('circle')
    .attr('class', d => `scatter-point${d.isPriority ? ' is-priority' : ''}`)
    .attr('cx', d => x(d.teen1217))
    .attr('cy', d => y(d.oos))
    .attr('r', d => r(d.teen1217))
    .attr('fill', d => d.isPriority ? red : accent)
    .style('cursor', 'pointer')
    .on('mouseover', (event, d) => {
      showTip(event, `
        <div style="font-weight:900;margin-bottom:6px">${escapeHtml(d.name)}</div>
        <div><b>Year:</b> ${YEAR}</div>
        <div><b>Teen hosted (12–17):</b> ${fmtNum(d.teen1217)}</div>
        <div><b>OOS (secondary-age):</b> ${d.oos.toFixed(1)}%</div>
        <div style="margin-top:8px;opacity:0.85">
          <b>Cliff context:</b> Primary ${d.primary.toFixed(1)}% → Secondary ${d.secondary.toFixed(1)}% (drop −${d.drop.toFixed(1)}%)
        </div>
        <div style="margin-top:8px;opacity:0.70;font-size:12px">
          Priority zone = above both medians (teen burden & OOS).
        </div>
      `);
    })
    .on('mousemove', moveTip)
    .on('mouseout', hideTip);

  // Labels:
  const labelData = isNarrow ? data.filter(d => d.isPriority) : data;

  g.append('g')
    .selectAll('text.oos-label')
    .data(labelData, d => d.code)
    .enter()
    .append('text')
    .attr('class', 'oos-label')
    .attr('x', d => x(d.teen1217) + r(d.teen1217) + 6)
    .attr('y', d => y(d.oos) + 4)
    .text(d => (d.name.length > 18 ? d.name.slice(0, 16) + '…' : d.name));

  // -----------------------------
  // Legend
  // -----------------------------
  const priorityCount = data.filter(d => d.isPriority).length;

  const items = [
    { label: `non-Priority zone`, color: accent },
    { label: `Priority zone`, color: red }
  ];

  const it = legend.selectAll('.legend-item')
    .data(items)
    .enter()
    .append('div')
    .attr('class', 'legend-item');

  it.append('span')
    .attr('class', 'legend-swatch')
    .style('background', d => d.color);

  it.append('span')
    .text(d => d.label);

  // -----------------------------
  // ResizeObserver 
  // -----------------------------
  try {
    if (typeof ResizeObserver !== 'undefined') {
      let raf = 0;
      window.__scatterLastW = window.__scatterLastW || 0;

      window.__scatterRO = new ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const wNow = container.node().getBoundingClientRect().width || 0;
          if (!wNow) return;
          if (Math.abs(wNow - window.__scatterLastW) < 2) return;
          window.__scatterLastW = wNow;
          window.renderResilienceBurdenScatter();
        });
      });

      window.__scatterLastW = container.node().getBoundingClientRect().width || 0;
      window.__scatterRO.observe(container.node());
    }
  } catch (e) {
    // ignore
  }

  console.log('✓ Scatter rendered (responsive)', {
    year: YEAR,
    cliffSubset: cliffSubset.map(d => d.code),
    plotted: data.map(d => d.code),
    missingOOS: missingOOS.map(d => d.code)
  });
};

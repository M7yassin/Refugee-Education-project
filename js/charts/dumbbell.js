/* =========================================================
 * Cliff / Dumbbell with UI Filters + Overlay Panel 
 * Default on page load:
 *   - Year = 2024
 *   - Top hosts = 15 (max 15)
 *   - Max shown = 8 (max 10)
 *   - Panel open = false 
 * ========================================================= */

window.renderDumbbellChart = function () {
  const container = document.getElementById('chart-dumbbell');
  const legend = document.getElementById('legend-dumbbell');

  if (!container) {
    console.error('Dumbbell chart container not found (#chart-dumbbell)');
    return;
  }

  // -----------------------------
  // Kill previous ResizeObserver
  // -----------------------------
  if (window.__dumbbellRO) {
    try { window.__dumbbellRO.disconnect(); } catch (e) {}
    window.__dumbbellRO = null;
  }

  // ---------------
  // Tooltip 
  // -----------------
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
  // Clear
  // -----------------------------
  d3.select(container).selectAll('*').remove();
  if (legend) legend.innerHTML = '';

  // -----------------------------
  // Data checks
  // -----------------------------
  const proc = window.AppData?.processed;
  const edu = window.AppData?.education || [];

  if (!proc?.years?.length) {
    container.innerHTML = '<p class="dumbbell-empty">No demographics processed.</p>';
    return;
  }
  if (!edu.length) {
    container.innerHTML = '<p class="dumbbell-empty">No education data loaded.</p>';
    return;
  }

  // -----------------------------
  // Years availability: demo ∩ edu, >=2010
  // -----------------------------
  const demoYears = proc.years.slice().sort((a, b) => a - b);

  const eduYearCols = edu.length
    ? Object.keys(edu[0]).filter(k => /^\d{4}$/.test(k)).map(Number).sort((a, b) => a - b)
    : [];

  const eduYearSet = new Set(eduYearCols);

  const yearsUI = demoYears
    .filter(y => y >= 2010 && eduYearSet.has(y))
    .sort((a, b) => a - b);

  if (!yearsUI.length) {
    container.innerHTML = '<p class="dumbbell-empty">No overlapping years between demographics and education (>=2010).</p>';
    return;
  }

  // -----------------------------
  // State (persist in AppData)
  // -----------------------------
  window.AppData = window.AppData || {};
  if (!window.AppData.dumbbellUI) {
    window.AppData.dumbbellUI = { year: 2024, topHosts: 15, maxShow: 8, panelOpen: false };
  }
  const state = window.AppData.dumbbellUI;

  // Validate year
  if (!yearsUI.includes(state.year)) {
    const below = yearsUI.filter(y => y <= 2024);
    state.year = below.length ? below[below.length - 1] : yearsUI[yearsUI.length - 1];
  }

  // Clamp sliders
  state.topHosts = Math.max(5, Math.min(15, state.topHosts ?? 15));
  state.maxShow = Math.max(3, Math.min(10, state.maxShow ?? 8));
  if (state.maxShow > state.topHosts) state.maxShow = state.topHosts;

  // -----------------------------
  // Education lookups (robust keys)
  // -----------------------------
  const sample = edu[0] || {};
  const KEY_COUNTRY = ('countryCode' in sample) ? 'countryCode' : ('Country Code' in sample ? 'Country Code' : null);
  const KEY_NAME = ('countryName' in sample) ? 'countryName' : ('Country Name' in sample ? 'Country Name' : null);
  const KEY_IND = ('indicatorCode' in sample) ? 'indicatorCode' : ('Indicator Code' in sample ? 'Indicator Code' : null);

  if (!KEY_COUNTRY || !KEY_IND) {
    container.innerHTML = '<p class="dumbbell-empty dumbbell-empty-error">Education columns not detected.</p>';
    return;
  }

  const rowsByCode = new Map();
  const nameByCode = new Map();

  edu.forEach(r => {
    const code = r[KEY_COUNTRY];
    if (!code) return;
    if (!rowsByCode.has(code)) rowsByCode.set(code, []);
    rowsByCode.get(code).push(r);

    const nm = KEY_NAME ? r[KEY_NAME] : null;
    if (nm && !nameByCode.has(code)) nameByCode.set(code, nm);
  });

  function getNum(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = +v;
    return Number.isFinite(n) ? n : null;
  }

  function rowOf(code, ind) {
    const rows = rowsByCode.get(code) || [];
    return rows.find(x => x[KEY_IND] === ind) || null;
  }

  function valueAt(code, ind, year) {
    const r = rowOf(code, ind);
    if (!r) return null;
    return getNum(r[String(year)]);
  }

  const PRIMARY = 'SE.PRM.TENR';
  const SECONDARY = 'SE.SEC.NENR';

  // -----------------------------
  // Overlay panel nodes (from HTML)
  // -----------------------------
  const panel = document.getElementById('cliff-panel');
  const panelTitle = document.getElementById('cliff-panel-title');
  const panelSub = document.getElementById('cliff-panel-sub');
  const panelList = document.getElementById('cliff-panel-list');

  const hasPanel = !!(panel && panelTitle && panelSub && panelList);

  function paintPanelVisibility() {
    if (!hasPanel) return;
    panel.style.display = state.panelOpen ? '' : 'none';
  }

  // -----------------------------
  // Layout: inject controls + svg inside #chart-dumbbell
  // -----------------------------
  const host = d3.select(container).append('div').attr('class', 'cliff-host');
  const controlsHost = host.append('div').attr('class', 'dumbbell-controls-wrap');
  const chartHost = host.append('div').attr('class', 'dumbbell-chart-wrap');

  // -----------------------------
  // Controls UI
  // -----------------------------
  const controls = controlsHost.append('div')
    .attr('class', 'dumbbell-controls');

  // LEFT (Year)
  const left = controls.append('div').attr('class', 'cliff-controls-left');

  left.append('div')
    .attr('class', 'cliff-year-caption')
    .text('Year');

  const yearSel = left.append('select')
    .attr('class', 'cliff-year-select');

  yearSel.selectAll('option')
    .data(yearsUI)
    .enter()
    .append('option')
    .attr('value', d => d)
    .property('selected', d => d === state.year)
    .text(d => d);

  // CENTER (sliders stacked)
  const center = controls.append('div').attr('class', 'cliff-controls-center');

  const topRow = center.append('div').attr('class', 'cliff-slider-row');
  const topLabel = topRow.append('div').attr('class', 'cliff-slider-label');

  const topInput = topRow.append('input')
    .attr('type', 'range')
    .attr('min', 5)
    .attr('max', 15)
    .attr('step', 1)
    .attr('class', 'cliff-range');

  const showRow = center.append('div').attr('class', 'cliff-slider-row');
  const showLabel = showRow.append('div').attr('class', 'cliff-slider-label');

  const showInput = showRow.append('input')
    .attr('type', 'range')
    .attr('min', 3)
    .attr('max', 10)
    .attr('step', 1)
    .attr('class', 'cliff-range');

  // RIGHT (toggle panel)
  const right = controls.append('div').attr('class', 'cliff-controls-right');

  const btnPanel = right.append('button')
    .attr('type', 'button')
    .attr('class', 'cliff-btn');

  function paintControlTexts() {
    topLabel.text(`Top hosts: ${state.topHosts} (max 15)`);
    showLabel.text(`Max shown: ${state.maxShow} (max 10)`);

    topInput.property('value', state.topHosts);
    showInput.property('value', state.maxShow);

    if (state.maxShow > state.topHosts) {
      state.maxShow = state.topHosts;
      showInput.property('value', state.maxShow);
      showLabel.text(`Max shown: ${state.maxShow} (max 10)`);
    }

    btnPanel
      .text(state.panelOpen ? 'Hide hosts list' : 'Show hosts list')
      .classed('is-active', state.panelOpen);

    paintPanelVisibility();
  }

  // -----------------------------
  // Panel renderer
  // -----------------------------
  function renderSidePanel(items, plottedSet) {
    if (!hasPanel) return;

    panelTitle.textContent = `Top ${state.topHosts} hosts (${state.year})`;
    panelSub.textContent = 'Sorted by hosted school-age children (5–17).';

    panelList.innerHTML = '';

    items.forEach((d, i) => {
      const row = document.createElement('div');
      row.className = 'cliff-row';

      const rank = document.createElement('div');
      rank.className = 'cliff-rank';
      rank.textContent = `${i + 1}.`;

      const meta = document.createElement('div');
      meta.className = 'cliff-meta';

      const nm = document.createElement('div');
      nm.className = 'cliff-name';
      nm.textContent = d.name;

      const bur = document.createElement('div');
      bur.className = 'cliff-burden';
      bur.textContent = `Burden: ${window.formatNum ? window.formatNum(d.burden) : d.burden.toLocaleString()}`;

      meta.appendChild(nm);
      meta.appendChild(bur);

      const chip = document.createElement('div');
      const ok = plottedSet.has(d.code);
      chip.className = 'cliff-chip ' + (ok ? 'ok' : 'miss');
      chip.textContent = ok ? 'Plotted' : 'Missing edu';

      row.appendChild(rank);
      row.appendChild(meta);
      row.appendChild(chip);

      panelList.appendChild(row);
    });
  }

  // -----------------------------
  // Render
  // -----------------------------
  function render() {
    chartHost.selectAll('*').remove();
    controlsHost.selectAll('.explain-block').remove();

    const YEAR = state.year;

    const byAsylumObj = proc.byYear?.[YEAR]?.byAsylum || {};
    const hosts = Object.values(byAsylumObj)
      .filter(h => h && h.code && (h.total || 0) > 0)
      .sort((a, b) => (b.total || 0) - (a.total || 0))
      .slice(0, state.topHosts)
      .map(h => ({
        code: h.code,
        name: h.name || nameByCode.get(h.code) || h.code,
        burden: h.total || 0
      }));

    if (!hosts.length) {
      controlsHost.append('div')
        .attr('class', 'explain-block explain-muted')
        .text(`No host data for year ${YEAR}.`);

      renderSidePanel([], new Set());
      return;
    }

    const complete = [];
    hosts.forEach(h => {
      const p = valueAt(h.code, PRIMARY, YEAR);
      const s = valueAt(h.code, SECONDARY, YEAR);

      if (p != null && s != null) {
        const primary = Math.max(0, Math.min(105, p));
        const secondary = Math.max(0, Math.min(105, s));
        complete.push({ ...h, primary, secondary, drop: primary - secondary });
      }
    });

    complete.sort((a, b) => (b.drop - a.drop) || (b.burden - a.burden));
    const plotted = complete.slice(0, state.maxShow);
    const plottedSet = new Set(plotted.map(d => d.code));

    renderSidePanel(hosts, plottedSet);

    controlsHost.append('div')
      .attr('class', 'explain-block explain-info')
      .html(`
        <b>How it works:</b> Start from <b>Top ${state.topHosts}</b> host countries (by burden, 5–17) in <b>${YEAR}</b>.
        Plot only those with <b>complete Primary + Secondary</b> data in ${YEAR}. Showing up to <b>${state.maxShow}</b>.
      `);

    if (!plotted.length) {
      controlsHost.append('div')
        .attr('class', 'explain-block explain-muted')
        .text(`None of the Top ${state.topHosts} hosts have complete education data in ${YEAR}.`);
      return;
    }

    // -----------------------------
    // Responsive chart sizing
    // -----------------------------
    const rect = chartHost.node().getBoundingClientRect();
    const width = Math.max(320, rect.width || 980);
    const isNarrow = width < 620;

    const margin = {
      top: 18,
      right: isNarrow ? 56 : 80,
      bottom: 55,
      left: isNarrow ? 118 : 170
    };

    // Dynamic height based on number of rows (prevents cramped/zoom feel)
    const rowPitch = isNarrow ? 44 : 46;
    const innerH = Math.max(240, plotted.length * rowPitch);
    const height = Math.round(
      Math.max(360, Math.min(620, innerH + margin.top + margin.bottom))
    );

    const innerW = width - margin.left - margin.right;
    const innerHH = height - margin.top - margin.bottom;

    function shortName(s) {
      if (!isNarrow) return s;
      const max = 18;
      return (s.length > max) ? (s.slice(0, max - 1) + '…') : s;
    }

    const x = d3.scaleLinear().domain([0, 105]).range([0, innerW]);
    const y = d3.scaleBand().domain(plotted.map(d => d.name)).range([0, innerHH]).padding(isNarrow ? 0.28 : 0.35);

    // Responsive SVG: viewBox + CSS controls the size
    const svg = chartHost.append('svg')
      .attr('class', 'dumbbell-svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMinYMin meet');

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Gridlines (vertical)
    [25, 50, 75, 100].forEach(tick => {
      g.append('line')
        .attr('class', tick === 100 ? 'dumbbell-grid dumbbell-grid-strong' : 'dumbbell-grid')
        .attr('x1', x(tick)).attr('x2', x(tick))
        .attr('y1', 0).attr('y2', innerHH);
    });

    // Rows
    const rowsG = g.selectAll('g.row')
      .data(plotted, d => d.code)
      .enter()
      .append('g')
      .attr('class', 'dumbbell-row')
      .attr('transform', d => `translate(0, ${y(d.name) + y.bandwidth() / 2})`);

    // Hover hit area
    rowsG.append('rect')
      .attr('class', 'dumbbell-hit')
      .attr('x', 0)
      .attr('y', -y.bandwidth() / 2)
      .attr('width', innerW)
      .attr('height', y.bandwidth());

    rowsG.append('line')
      .attr('class', 'dumbbell-connector')
      .attr('x1', d => x(d.secondary))
      .attr('x2', d => x(d.primary))
      .attr('y1', 0).attr('y2', 0);

    rowsG.append('circle')
      .attr('class', 'dumbbell-dot dumbbell-dot-secondary')
      .attr('cx', d => x(d.secondary))
      .attr('cy', 0)
      .attr('r', isNarrow ? 8 : 9);

    rowsG.append('circle')
      .attr('class', 'dumbbell-dot dumbbell-dot-primary')
      .attr('cx', d => x(d.primary))
      .attr('cy', 0)
      .attr('r', isNarrow ? 8 : 9);

    // Drop labels (badge)
    rowsG.each(function (d) {
      const midX = (x(d.primary) + x(d.secondary)) / 2;
      const textVal = `−${Math.round(d.drop)}%`;

      const gg = d3.select(this).append('g').attr('class', 'dumbbell-drop');

      gg.append('rect')
        .attr('class', 'dumbbell-drop-bg')
        .attr('rx', 6).attr('ry', 6)
        .attr('y', -21)
        .attr('height', 18);

      const t = gg.append('text')
        .attr('class', 'dumbbell-drop-text')
        .attr('y', -12)
        .text(textVal);

      const w = t.node().getBBox().width;
      gg.select('rect').attr('width', w + 12).attr('x', -(w / 2) - 6);
      t.attr('x', -(w / 2));
      gg.attr('transform', `translate(${midX}, 0)`);
    });

    const fmtPct = v => (v == null) ? '—' : `${(+v).toFixed(1)}%`;

    rowsG
      .style('cursor', 'pointer')
      .on('mouseover', function (event, d) {
        d3.select(this).select('.dumbbell-connector').classed('is-hot', true);
        d3.select(this).select('.dumbbell-dot-primary').attr('r', isNarrow ? 11 : 12);
        d3.select(this).select('.dumbbell-dot-secondary').attr('r', isNarrow ? 11 : 12);

        showTip(event, `
          <div style="font-weight:900;margin-bottom:6px">${d.name}</div>
          <div><b>Year:</b> ${YEAR}</div>
          <div><b>Burden (5–17):</b> ${window.formatNum ? window.formatNum(d.burden) : d.burden.toLocaleString()}</div>
          <div style="margin-top:8px;display:grid;grid-template-columns:1fr auto;gap:6px 10px;">
            <div style="opacity:0.85;">Primary</div><div style="font-weight:800;color:#ffd27a;">${fmtPct(d.primary)}</div>
            <div style="opacity:0.85;">Secondary</div><div style="font-weight:800;color:#d7d7d7;">${fmtPct(d.secondary)}</div>
          </div>
          <div style="margin-top:6px;">Drop: <b style="color:#ff6b6b;">−${d.drop.toFixed(1)}%</b></div>
        `);
      })
      .on('mousemove', moveTip)
      .on('mouseout', function () {
        d3.select(this).select('.dumbbell-connector').classed('is-hot', false);
        d3.select(this).select('.dumbbell-dot-primary').attr('r', isNarrow ? 8 : 9);
        d3.select(this).select('.dumbbell-dot-secondary').attr('r', isNarrow ? 8 : 9);
        hideTip();
      });

    // Y axis (names)
    g.append('g')
      .attr('class', 'dumbbell-axis dumbbell-y-axis')
      .call(d3.axisLeft(y).tickFormat(shortName));

    // X axis
    g.append('g')
      .attr('class', 'dumbbell-axis dumbbell-x-axis')
      .attr('transform', `translate(0,${innerHH})`)
      .call(d3.axisBottom(x).tickValues([0, 25, 50, 75, 100]).tickFormat(d => d + '%'));

    // X label
    g.append('text')
      .attr('class', 'dumbbell-x-label')
      .attr('x', innerW / 2)
      .attr('y', innerHH + 42)
      .attr('text-anchor', 'middle')
      .text('Enrollment Rate →');

    // Legend
    if (legend) {
      legend.innerHTML = `
        <div class="legend-item">
          <span class="legend-color legend-primary"></span>
          <span class="legend-text">Primary (in-school proxy)</span>
        </div>
        <div class="legend-item">
          <span class="legend-color legend-secondary"></span>
          <span class="legend-text">Secondary (in-school proxy)</span>
        </div>
      `;
    }
  }

  // -----------------------------
  // Events
  // -----------------------------
  yearSel.on('change', function () {
    state.year = +this.value;
    render();
  });

  topInput.on('input', function () {
    state.topHosts = +this.value;
    if (state.topHosts > 15) state.topHosts = 15;
    if (state.maxShow > state.topHosts) state.maxShow = state.topHosts;
    paintControlTexts();
    render();
  });

  showInput.on('input', function () {
    state.maxShow = +this.value;
    if (state.maxShow > 10) state.maxShow = 10;
    if (state.maxShow > state.topHosts) state.maxShow = state.topHosts;
    paintControlTexts();
    render();
  });

  btnPanel.on('click', function () {
    state.panelOpen = !state.panelOpen;
    paintControlTexts();
  });

  // Initial paint + render
  paintControlTexts();
  render();

  // -----------------------------
  // ResizeObserver (rerender safely)
  // -----------------------------
  try {
    if (typeof ResizeObserver !== 'undefined') {
      let raf = 0;
      window.__dumbbellLastW = window.__dumbbellLastW || 0;

      window.__dumbbellRO = new ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const w = container.getBoundingClientRect().width || 0;
          if (!w) return;
          if (Math.abs(w - window.__dumbbellLastW) < 2) return;
          window.__dumbbellLastW = w;
          window.renderDumbbellChart();
        });
      });

      window.__dumbbellLastW = container.getBoundingClientRect().width || 0;
      window.__dumbbellRO.observe(container);
    }
  } catch (e) {
    // ignore
  }
};

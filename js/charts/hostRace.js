/* ========================================================
   Host Race Chart (HORIZONTAL Bars) - DYNAMIC TOP 8 PER YEAR
   - School-age (5-17)
   - Cross-border only (origin != asylum)
   - Cumulative by year (2010..Y)
   - Each year shows Top 8 hosts for that year
   ======================================================== */

window.renderHostRaceChart = function renderHostRaceChart() {
  const container = d3.select('#chart-host-race');
  const legend = d3.select('#legend-host-race');

  if (container.empty()) return;

  container.selectAll('*').remove();
  legend.selectAll('*').remove();

  const years = window.AppData?.processed?.years || [];
  const demo = window.AppData?.demographics || [];
  if (!years.length || !demo.length) return;

  const yearList = years.slice().sort((a, b) => a - b);
  const firstYear = yearList[0];
  const lastYear = yearList[yearList.length - 1];

  // =========================
  // CONFIG
  // =========================
  const BORDER_MODE = "softBlack"; // "softBlack" | "none"
  const BAR_RADIUS = 0;

  // -------------------------
  // Pre-group rows by year
  // -------------------------
  const rowsByYear = new Map();
  for (const d of demo) {
    const y = +d.year;
    if (!rowsByYear.has(y)) rowsByYear.set(y, []);
    rowsByYear.get(y).push(d);
  }

  // -------------------------
  // year -> Map(hostName -> cumulative)
  // -------------------------
  const cumulativeByYear = new Map();
  const running = new Map();

  for (const y of yearList) {
    const rows = rowsByYear.get(y) || [];
    for (const d of rows) {
      if (d.originCode === d.asylumCode) continue;

      const v =
        (+d.female511 || 0) + (+d.male511 || 0) +
        (+d.female1217 || 0) + (+d.male1217 || 0);

      if (v <= 0) continue;

      const hostName = d.asylumName;
      running.set(hostName, (running.get(hostName) || 0) + v);
    }

    const snap = new Map();
    running.forEach((val, key) => snap.set(key, val));
    cumulativeByYear.set(y, snap);
  }

  function top8ForYear(y) {
    const snap = cumulativeByYear.get(y) || new Map();
    return Array.from(snap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }

  // =====================================================
  // MUTED palette
  // =====================================================
  const MUTED = [
    '#1A3A5C',
    '#D4A012',
    '#7EBDC3',
    '#FFD000',
    '#4A4A4A',
    '#E87D1E',
    '#8B8B8B',
    '#C4C4C4'
  ];

  const RANK_HIGHLIGHTS = [
    '#FFD000',
    '#D4A012',
    '#E87D1E',
    '#1A3A5C',
    '#7EBDC3',
    '#4A4A4A',
    '#8B8B8B',
    '#C4C4C4'
  ];

  const STROKE = (BORDER_MODE === "softBlack") ? 'rgba(0,0,0,0.12)' : 'none';
  const STROKE_W = (BORDER_MODE === "softBlack") ? 1 : 0;

  window._hostRaceColorCache = window._hostRaceColorCache || new Map();
  const COLOR_CACHE = window._hostRaceColorCache;

  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0);
  }

  function stableColor(name) {
    if (COLOR_CACHE.has(name)) return COLOR_CACHE.get(name);
    const idx = hashString(name) % MUTED.length;
    const c = MUTED[idx];
    COLOR_CACHE.set(name, c);
    return c;
  }

  function assignDisplayColors(data) {
    const used = new Set();
    const out = [];

    for (let i = 0; i < data.length; i++) {
      const d = data[i];

      let preferred = (i < RANK_HIGHLIGHTS.length)
        ? RANK_HIGHLIGHTS[i]
        : stableColor(d.name);

      let idx = MUTED.indexOf(preferred);
      if (idx < 0) idx = hashString(d.name) % MUTED.length;

      let attempts = 0;
      while (used.has(MUTED[idx]) && attempts < MUTED.length) {
        idx = (idx + 1) % MUTED.length;
        attempts++;
      }

      const fill = used.has(preferred) ? MUTED[idx] : preferred;

      used.add(fill);
      out.push({ ...d, _fill: fill, _rank: i });
    }

    return out;
  }

  // -------------------------
  // Responsive layout
  // -------------------------
  const width = container.node().clientWidth || 900;
  const isNarrow = width < 520;

  const height = Math.round(Math.max(320, Math.min(460, width * 0.55)));

  const margin = {
    top: 10,
    right: isNarrow ? 70 : 95,
    bottom: 20,
    left: isNarrow ? 140 : 230
  };

  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  function shortName(s) {
    if (!isNarrow) return s;
    const max = 18;
    return (s.length > max) ? (s.slice(0, max - 1) + '…') : s;
  }

  // -------------------------
  // SVG
  // -------------------------
  const svg = container.append('svg')
    .attr('class', 'hostrace-svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMinYMin meet');

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const y = d3.scaleBand().range([0, innerH]).padding(isNarrow ? 0.22 : 0.28);
  const x = d3.scaleLinear().range([0, innerW]);

  const xAxisG = g.append('g')
    .attr('class', 'hostrace-x-axis')
    .attr('transform', `translate(0,0)`);

  const labelYear = g.append('text')
    .attr('class', 'hostrace-year')
    .attr('x', innerW)
    .attr('y', innerH - 10)
    .attr('text-anchor', 'end')
    .attr('font-size', isNarrow ? 46 : 56)
    .text('');

  // -------------------------
  // Controls 
  // -------------------------
  const playBtn = document.getElementById('hostrace-play');
  const slider = document.getElementById('hostrace-slider');
  const yearBox = document.getElementById('hostrace-year');

  let currentYear = firstYear;
  let timer = null;

  if (slider) {
    slider.min = String(firstYear);
    slider.max = String(lastYear);
    slider.value = String(currentYear);
  }
  if (yearBox) yearBox.textContent = String(currentYear);

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    if (playBtn) playBtn.textContent = 'Play';
  }

  function play() {
    stop();
    if (playBtn) playBtn.textContent = 'Pause';

    timer = setInterval(() => {
      const idx = yearList.indexOf(currentYear);
      const next = (idx < yearList.length - 1) ? yearList[idx + 1] : yearList[0];
      renderYear(next, true);
    }, 950);
  }

  if (playBtn) {
    playBtn.onclick = () => {
      if (timer) stop();
      else play();
    };
  }

  if (slider) {
    slider.oninput = (e) => {
      stop();
      renderYear(+e.target.value, false);
    };
  }

  // -------------------------
  // Tooltip 
  // -------------------------
  function getTooltipEl() {
    let tip = document.getElementById('hostrace-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'hostrace-tooltip';
      document.body.appendChild(tip);
    }
    return tip;
  }

  const tipEl = getTooltipEl();

  function positionTip(event) {
    const px = (event.clientX ?? 0) + 14;
    const py = (event.clientY ?? 0) - 10;
    const maxX = window.innerWidth - 280;
    tipEl.style.left = `${Math.min(px, maxX)}px`;
    tipEl.style.top = `${py}px`;
  }

  function showTip(event, html) {
    tipEl.innerHTML = html;
    positionTip(event);
    tipEl.classList.add('visible');
  }

  function moveTip(event) { positionTip(event); }
  function hideTip() { tipEl.classList.remove('visible'); }

  function fmt(n) {
    return window.formatNum ? window.formatNum(n) : n.toLocaleString();
  }

  // -------------------------
  // Render
  // -------------------------
  function renderYear(ySelected, animate = true) {
    const raw = top8ForYear(ySelected);
    const data = assignDisplayColors(raw);

    y.domain(data.map(d => d.name));
    x.domain([0, d3.max(data, d => d.value) || 0]).nice();

    const xAxis = d3.axisTop(x)
      .ticks(isNarrow ? 4 : 6)
      .tickSize(-innerH)
      .tickFormat(window.formatNum || (d => d));

    xAxisG.call(xAxis);

    labelYear.text(String(ySelected));

    const t = animate ? svg.transition().duration(650).ease(d3.easeCubicOut) : null;

    // Bars
    const bars = g.selectAll('rect.host-bar')
      .data(data, d => d.name);

    bars.exit()
      .transition(t)
      .attr('width', 0)
      .style('opacity', 0)
      .remove();

    const barsEnter = bars.enter()
      .append('rect')
      .attr('class', 'host-bar')
      .attr('x', 0)
      .attr('y', d => y(d.name))
      .attr('height', y.bandwidth())
      .attr('rx', BAR_RADIUS)
      .attr('ry', BAR_RADIUS)
      .attr('width', 0)
      .attr('fill', d => d._fill)
      .attr('stroke', STROKE)
      .attr('stroke-width', STROKE_W)
      .on('mousemove', (event, d) => {
        showTip(event, `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="width:10px;height:10px;border-radius:2px;background:${d._fill};display:inline-block;"></span>
            <div style="font-weight:800;color:#E0BF2F;">${d.name}</div>
          </div>
          <div><strong>From 2010 cumulative:</strong> ${fmt(d.value)}</div>
          <div style="margin-top:6px;opacity:0.75;">Cross-border only, ages 5–17</div>
        `);
        moveTip(event);
      })
      .on('mouseleave', hideTip);

    const barsMerged = barsEnter.merge(bars);

    // Top1 subtle glow only
    barsMerged.style('filter', d => (d._rank === 0 ? 'drop-shadow(0 2px 10px rgba(224,191,47,0.16))' : 'none'));

    if (t) {
      barsMerged.transition(t)
        .attr('y', d => y(d.name))
        .attr('height', y.bandwidth())
        .attr('width', d => x(d.value))
        .attr('fill', d => d._fill);
    } else {
      barsMerged
        .attr('y', d => y(d.name))
        .attr('height', y.bandwidth())
        .attr('width', d => x(d.value))
        .attr('fill', d => d._fill);
    }

    // Labels (left)
    const labels = g.selectAll('text.host-label')
      .data(data, d => d.name);

    labels.exit().remove();

    const labelsEnter = labels.enter()
      .append('text')
      .attr('class', 'host-label')
      .attr('x', -12)
      .attr('y', d => y(d.name) + y.bandwidth() / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .text(d => shortName(d.name));

    const labelsMerged = labelsEnter.merge(labels);

    if (t) {
      labelsMerged.transition(t)
        .attr('y', d => y(d.name) + y.bandwidth() / 2)
        .text(d => shortName(d.name));
    } else {
      labelsMerged
        .attr('y', d => y(d.name) + y.bandwidth() / 2)
        .text(d => shortName(d.name));
    }

    // Values (right of bars)
    const values = g.selectAll('text.host-value')
      .data(data, d => d.name);

    values.exit().remove();

    const valuesEnter = values.enter()
      .append('text')
      .attr('class', 'host-value')
      .attr('x', d => x(d.value) + 8)
      .attr('y', d => y(d.name) + y.bandwidth() / 2)
      .attr('dominant-baseline', 'middle')
      .text(d => fmt(d.value));

    const valuesMerged = valuesEnter.merge(values);

    if (t) {
      valuesMerged.transition(t)
        .attr('x', d => Math.min(innerW - 5, x(d.value) + 8))
        .attr('y', d => y(d.name) + y.bandwidth() / 2)
        .tween('text', function(d) {
          const prev = +this._lastValue || 0;
          const interp = d3.interpolateNumber(prev, d.value);
          this._lastValue = d.value;
          return (tt) => { this.textContent = fmt(Math.round(interp(tt))); };
        });
    } else {
      valuesMerged
        .attr('x', d => Math.min(innerW - 5, x(d.value) + 8))
        .attr('y', d => y(d.name) + y.bandwidth() / 2)
        .text(d => fmt(d.value));
      valuesMerged.each(function(d){ this._lastValue = d.value; });
    }

    // Legend: displayed colors
    legend.selectAll('*').remove();
    const items = legend.selectAll('.legend-item')
      .data(data.map(d => ({ name: d.name, color: d._fill, rank: d._rank })))
      .enter()
      .append('div')
      .attr('class', 'legend-item');

    items.append('div')
      .attr('class', 'legend-color')
      .style('background', d => d.color)
      .style('outline', d => (d.rank === 0 ? `2px solid rgba(224,191,47,0.9)` : 'none'))
      .style('outline-offset', '2px');

    items.append('div')
      .attr('class', 'legend-text')
      .text(d => d.name);

    currentYear = ySelected;
    if (slider) slider.value = String(currentYear);
    if (yearBox) yearBox.textContent = String(currentYear);
  }

  // First render
  renderYear(currentYear, false);

  // -------------------------
  // ResizeObserver 
  // -------------------------
  try {
    if (!window.__hostRaceRO && typeof ResizeObserver !== 'undefined') {
      let raf = 0;
      window.__hostRaceLastW = window.__hostRaceLastW || 0;

      window.__hostRaceRO = new ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const w = container.node()?.clientWidth || 0;
          if (!w) return;
          if (Math.abs(w - window.__hostRaceLastW) < 2) return;
          window.__hostRaceLastW = w;
          window.renderHostRaceChart();
        });
      });

      window.__hostRaceLastW = width;
      window.__hostRaceRO.observe(container.node());
    }
  } catch (e) {
    // ignore
  }
};

/* ========================================================
   Stacked Area Chart - Child Displacement Trend (2010-2024)
   - Uses demographics (0–4, 5–11, 12–17)
   - Aggregates CROSS-BORDER ONLY (origin != asylum)
   - Responsive: viewBox + ResizeObserver rerender
   - Styling moved to CSS (layers, axes, tooltip look)
   ======================================================== */

window.renderStackedAreaChart = function renderStackedAreaChart() {
  const container = d3.select('#chart-stacked-area');
  const legend = d3.select('#legend-stacked-area');

  if (container.empty()) return;

  container.selectAll('*').remove();
  legend.selectAll('*').remove();

  const years = window.AppData?.processed?.years || [];
  if (!years.length) return;

  const demo = window.AppData?.demographics || [];

  
  const width = container.node().clientWidth || 900;
  const isNarrow = width < 520;

  // Height scales with width, but clamped 
  const height = Math.round(
    Math.max(320, Math.min(460, width * 0.52))
  );

  const margin = {
    top: 18,
    right: isNarrow ? 14 : 30,
    bottom: isNarrow ? 52 : 42,
    left: isNarrow ? 50 : 62
  };

  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  // -------- data series --------
  const series = years.map(y => {
    if (demo.length) {
      const yd = demo.filter(d => d.year === y && d.originCode !== d.asylumCode); // cross-border only
      const a04 = d3.sum(yd, d => (d.male04 || 0) + (d.female04 || 0));
      const a511 = d3.sum(yd, d => (d.male511 || 0) + (d.female511 || 0));
      const a1217 = d3.sum(yd, d => (d.male1217 || 0) + (d.female1217 || 0));
      return { year: y, '0-4': a04, '5-11': a511, '12-17': a1217 };
    }

    const t = window.AppData.processed.byYear[y]?.totals;
    return {
      year: y,
      '0-4': t?.age04 || 0,
      '5-11': t?.primaryAge || 0,
      '12-17': t?.secondaryAge || 0
    };
  });

  const keys = ['0-4', '5-11', '12-17'];

  // -------- svg --------
  const svg = container.append('svg')
    .attr('class', 'stacked-area-svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMinYMin meet');

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear()
    .domain(d3.extent(series, d => d.year))
    .range([0, innerW]);

  const stack = d3.stack().keys(keys);
  const stacked = stack(series);

  const yMax = d3.max(stacked, layer => d3.max(layer, d => d[1])) || 0;

  const y = d3.scaleLinear()
    .domain([0, yMax])
    .nice()
    .range([innerH, 0]);

  const area = d3.area()
    .x(d => x(d.data.year))
    .y0(d => y(d[0]))
    .y1(d => y(d[1]))
    .curve(d3.curveMonotoneX);

  // -------- axes --------
  const xAxis = d3.axisBottom(x)
    .tickFormat(d3.format('d'))
    .ticks(isNarrow ? 5 : Math.min(8, years.length));

  const yAxis = d3.axisLeft(y)
    .ticks(isNarrow ? 5 : 6)
    .tickFormat(window.formatNum ? window.formatNum : d3.format('~s'));

  const gx = g.append('g')
    .attr('class', 'stacked-x-axis')
    .attr('transform', `translate(0,${innerH})`)
    .call(xAxis);

  if (isNarrow) {
    gx.selectAll('text')
      .attr('text-anchor', 'end')
      .attr('transform', 'rotate(-35)')
      .attr('dx', '-0.6em')
      .attr('dy', '0.2em');
  }

  g.append('g')
    .attr('class', 'stacked-y-axis')
    .call(yAxis);

  // -------- layers --------
  const layers = g.selectAll('.stacked-layer')
    .data(stacked)
    .enter()
    .append('path')
    .attr('class', 'stacked-layer')
    .attr('data-key', d => d.key)
    .attr('d', area);

  // -------- legend --------
  const legendItems = keys.map(k => ({ key: k, colorKey: k }));
  const items = legend.selectAll('.legend-item')
    .data(legendItems)
    .enter()
    .append('div')
    .attr('class', 'legend-item');

  items.append('div')
    .attr('class', 'legend-color')
    .style('background', d => {
      if (d.colorKey === '0-4') return 'rgba(136,136,136,0.55)';
      if (d.colorKey === '5-11') return 'rgba(212,168,75,0.60)';
      return 'rgba(232,185,35,0.70)';
    });

  items.append('div')
    .attr('class', 'legend-text')
    .text(d => d.key);

  // -------- svg tooltip --------
  const tipG = g.append('g')
    .attr('class', 'stacked-tip')
    .style('display', 'none')
    .style('pointer-events', 'none');

  const tipBg = tipG.append('rect')
    .attr('class', 'stacked-tip-bg')
    .attr('rx', 6)
    .attr('ry', 6);

  const tipTitle = tipG.append('text')
    .attr('class', 'stacked-tip-title');

  const tipLines = [
    tipG.append('text').attr('class', 'stacked-tip-line'),
    tipG.append('text').attr('class', 'stacked-tip-line'),
    tipG.append('text').attr('class', 'stacked-tip-line'),
    tipG.append('text').attr('class', 'stacked-tip-line'),
    tipG.append('text').attr('class', 'stacked-tip-line'),
    tipG.append('text').attr('class', 'stacked-tip-line subtle')
  ];

  const vline = g.append('line')
    .attr('class', 'stacked-vline')
    .attr('y1', 0)
    .attr('y2', innerH);

  const marker = g.append('circle')
    .attr('class', 'stacked-marker')
    .attr('r', 4);

  const overlay = g.append('rect')
    .attr('width', innerW)
    .attr('height', innerH)
    .attr('fill', 'none')
    .style('pointer-events', 'all')
    .style('cursor', 'crosshair');

  overlay.raise();

  const bisect = d3.bisector(d => d.year).left;

  function formatNumRaw(n) {
    return (window.formatNum ? window.formatNum(n) : n.toLocaleString());
  }

  function placeTooltip(mx, my, linesCount = 7) {
    const paddingX = 10;
    const paddingY = 10;
    const lineH = 16;

    const texts = [
      tipTitle.text(),
      ...tipLines.slice(0, linesCount - 1).map(t => t.text())
    ];

    const maxChars = d3.max(texts, t => (t || '').length) || 10;
    const boxW = Math.min(340, Math.max(210, maxChars * 7));
    const boxH = paddingY * 2 + lineH * linesCount;

    let xPos = mx + 12;
    let yPos = my - boxH - 12;

    if (xPos + boxW > innerW) xPos = mx - boxW - 12;
    if (yPos < 0) yPos = my + 12;

    tipBg.attr('x', xPos).attr('y', yPos).attr('width', boxW).attr('height', boxH);

    tipTitle.attr('x', xPos + paddingX).attr('y', yPos + paddingY + 12);

    tipLines.forEach((t, i) => {
      t.attr('x', xPos + paddingX)
       .attr('y', yPos + paddingY + 12 + lineH * (i + 1));
    });

    tipG.style('display', null);
  }

  function onMove(event) {
    const [mx, my] = d3.pointer(event);

    const yearGuess = x.invert(mx);
    const i = bisect(series, yearGuess);
    const a = series[Math.max(0, i - 1)];
    const b = series[Math.min(series.length - 1, i)];
    const d = (!b || (yearGuess - a.year < b.year - yearGuess)) ? a : b;

    const total = d['0-4'] + d['5-11'] + d['12-17'];
    const schoolAge = d['5-11'] + d['12-17'];
    const share = total > 0 ? (schoolAge / total) * 100 : 0;

    vline
      .attr('x1', x(d.year))
      .attr('x2', x(d.year))
      .style('opacity', 1);

    marker
      .attr('cx', x(d.year))
      .attr('cy', y(total))
      .style('opacity', 1);

    layers.style('opacity', 0.75);

    tipTitle.text(`${d.year}`);
    tipLines[0].text(`Total (0–17): ${formatNumRaw(total)}`);
    tipLines[1].text(`0–4: ${formatNumRaw(d['0-4'])}`);
    tipLines[2].text(`5–11: ${formatNumRaw(d['5-11'])}`);
    tipLines[3].text(`12–17: ${formatNumRaw(d['12-17'])}`);
    tipLines[4].text(`School-age (5–17): ${formatNumRaw(schoolAge)} (${share.toFixed(1)}%)`);
    tipLines[5].text(`Cross-border only (origin ≠ asylum)`);

    placeTooltip(mx, my, 7);
  }

  function onLeave() {
    vline.style('opacity', 0);
    marker.style('opacity', 0);
    layers.style('opacity', 1);
    tipG.style('display', 'none');
  }

  // pointer events: better on touch + mouse
  overlay
    .on('pointermove', onMove)
    .on('pointerleave', onLeave);

  // -------- ResizeObserver --------
  try {
    if (!window.__stackedAreaRO && typeof ResizeObserver !== 'undefined') {
      let raf = 0;
      window.__stackedAreaLastW = window.__stackedAreaLastW || 0;

      window.__stackedAreaRO = new ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const w = container.node()?.clientWidth || 0;
          if (!w) return;
          if (Math.abs(w - window.__stackedAreaLastW) < 2) return;
          window.__stackedAreaLastW = w;
          window.renderStackedAreaChart();
        });
      });

      window.__stackedAreaLastW = width;
      window.__stackedAreaRO.observe(container.node());
    }
  } catch (e) {
    // ignore 
  }
};

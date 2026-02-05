/* ========================================================
   Refugee Education Project — FINAL VERSION
   Data scope:
   - Demographics available: ages 0–17 (0–4, 5–11, 12–17)
   - Education crisis estimates focus on school-age: 5–17
   ======================================================== */

window.AppData = {
  demographics: null,
  education: null,
  processed: {
    years: [],
    byYear: {},
    byAsylum: {},
    byOrigin: {},
    flows: [],
    global: {}
  }
};

// UNHCR Enrollment Rates 
// NOTE: UNHCR typically frames:
// - Primary age ~ 5–11
// - Secondary age ~ 12–17
// Overall out-of-school refers to school-age (5–17)
const ENROLLMENT_RATES = {
  PRIMARY: 0.67,      // 67% primary (ages 5–11)
  SECONDARY: 0.37,    // 37% secondary (ages 12–17)
  OVERALL_OUT: 0.46   // 46% overall out of school (ages 5–17)
};

// Colors
window.COLORS = {
  accent: '#D4A84B',
  accentBright: '#E8B923',
  accentDark: '#B8942F',
  inSchool: '#D4A84B',
  outSchool: '#5A5A5A',
  male: '#D4A84B',
  female: '#E8B923',
  grey: '#888888',
  dark: '#1a1a1a',
  white: '#FFFFFF'
};

// ========================================================
// DATA LOADING
// ========================================================
async function loadData() {
  console.log('Loading data (Demographics 0–17; Education focus 5–17)...');

  try {
    const [demoRes, eduRes] = await Promise.all([
      fetch('data/clean_demographics.csv'),
      fetch('data/clean_education.csv')
    ]);

    const demoText = await demoRes.text();
    const eduText = await eduRes.text();

    // Parse demographics (child ages 0–17 only: 0–4, 5–11, 12–17)
    window.AppData.demographics = d3.csvParse(demoText, d => ({
      year: +d.Year,
      originCode: d['Country of Origin Code'],
      originName: d['Country of Origin Name'],
      asylumCode: d['Country of Asylum Code'],
      asylumName: d['Country of Asylum Name'],

      // Child groups only
      female04: +d['Female 0-4'] || 0,
      male04: +d['Male 0-4'] || 0,
      female511: +d['Female 5-11'] || 0,
      male511: +d['Male 5-11'] || 0,
      female1217: +d['Female 12-17'] || 0,
      male1217: +d['Male 12-17'] || 0

      // Excluded: 18-59, 60+
    }));

    // Parse education 
window.AppData.education = d3.csvParse(eduText, d => {
  // English comments: support both column naming conventions
  const row = {
    countryName: d['countryName'] ?? d['Country Name'] ?? null,
    countryCode: d['countryCode'] ?? d['Country Code'] ?? null,
    indicatorName: d['indicatorName'] ?? d['Indicator Name'] ?? null,
    indicatorCode: d['indicatorCode'] ?? d['Indicator Code'] ?? null
  };

  // Copy all year columns dynamically (2010..2024)
  Object.keys(d).forEach(k => {
    if (/^\d{4}$/.test(k)) {
      const v = d[k];
      row[k] = (v === undefined || v === null || String(v).trim() === '')
        ? null
        : +v;
    }
  });

  return row;
});


    console.log('✓ Demographics:', window.AppData.demographics.length, 'rows');
    console.log('✓ Education:', window.AppData.education.length, 'rows');

    processData();
    return true;

  } catch (err) {
    console.error('✗ Load failed:', err);
    return false;
  }
}

// ========================================================
// DATA PROCESSING - CHILDREN 0–17 AVAILABLE, EDUCATION FOCUS 5–17
// ========================================================
function processData() {
  const demo = window.AppData.demographics || [];
  const years = [...new Set(demo.map(d => d.year))].sort((a, b) => a - b);
  window.AppData.processed.years = years;

  years.forEach(year => {
    const yearData = demo.filter(d =>
  d.year === year &&
  d.originCode &&
  d.asylumCode &&
  d.originCode !== d.asylumCode
);


    // Aggregate totals (0–17)
    const totals = {
      male04: d3.sum(yearData, d => d.male04),
      female04: d3.sum(yearData, d => d.female04),
      male511: d3.sum(yearData, d => d.male511),
      female511: d3.sum(yearData, d => d.female511),
      male1217: d3.sum(yearData, d => d.male1217),
      female1217: d3.sum(yearData, d => d.female1217)
    };

    // Convenience totals
    totals.age04 = totals.male04 + totals.female04;               // 0–4
    totals.primaryAge = totals.male511 + totals.female511;        // 5–11
    totals.secondaryAge = totals.male1217 + totals.female1217;    // 12–17

    // Children 0–17 split
    totals.schoolAge517 = totals.primaryAge + totals.secondaryAge; // 5–17
    totals.children017 = totals.age04 + totals.schoolAge517;       // 0–17

    // Existing totals used by current charts (school-age only)
    totals.totalBoys = totals.male511 + totals.male1217;
    totals.totalGirls = totals.female511 + totals.female1217;
    totals.totalSchoolAge = totals.primaryAge + totals.secondaryAge;

    // By asylum country (school-age only: 5–17)
    const byAsylum = {};
    yearData.forEach(d => {
      const name = d.asylumName;
      if (!byAsylum[name]) {
        byAsylum[name] = {
          code: d.asylumCode, name,
          male511: 0, female511: 0, male1217: 0, female1217: 0,
          total: 0, primary: 0, secondary: 0
        };
      }
      byAsylum[name].male511 += d.male511;
      byAsylum[name].female511 += d.female511;
      byAsylum[name].male1217 += d.male1217;
      byAsylum[name].female1217 += d.female1217;
      byAsylum[name].primary += d.male511 + d.female511;
      byAsylum[name].secondary += d.male1217 + d.female1217;
      byAsylum[name].total += d.male511 + d.female511 + d.male1217 + d.female1217;
    });

    // By origin country (school-age only: 5–17)
    const byOrigin = {};
    yearData.forEach(d => {
      const name = d.originName;
      if (!byOrigin[name]) {
        byOrigin[name] = { code: d.originCode, name, total: 0 };
      }
      byOrigin[name].total += d.male511 + d.female511 + d.male1217 + d.female1217;
    });

    // Flows for map (school-age only: 5–17)
    const flows = [];
    const flowMap = new Map();
    yearData.forEach(d => {
      const val = d.male511 + d.female511 + d.male1217 + d.female1217;
      if (val > 0) {
        const key = `${d.originCode}|${d.asylumCode}`;
        flowMap.set(key, (flowMap.get(key) || 0) + val);
      }
    });
    flowMap.forEach((value, key) => {
      const [origin, asylum] = key.split('|');
      if (value >= 1000) flows.push({ origin, asylum, value });
    });

    window.AppData.processed.byYear[year] = { totals, byAsylum, byOrigin, flows };
  });

  mergeEducationData();
  calculateGlobalEstimates();

  console.log('✓ Data processed (0–17 available; 5–17 used for education estimates)');
}

// ========================================================
// MERGE EDUCATION DATA - Calculate Out-of-School Estimates (5–17 focus)
// ========================================================
function mergeEducationData() {
  const edu = window.AppData.education || [];
  const eduLookup = {};

  // helper: get available year columns (desc)
  const yearCols = edu.length
    ? Object.keys(edu[0]).filter(k => /^\d{4}$/.test(k)).sort((a, b) => (+b) - (+a))
    : [];

  edu.forEach(row => {
    const code = row.countryCode;
    if (!eduLookup[code]) eduLookup[code] = {};

    // Get most recent value from ANY year column
    let val = null;
    for (const y of yearCols) {
      if (row[y] !== null && row[y] !== undefined) { val = row[y]; break; }
    }

    if (row.indicatorCode === 'SE.PRM.TENR') {
      eduLookup[code].primary = val;
    }
    if (row.indicatorCode === 'SE.SEC.NENR' || row.indicatorCode === 'SE.SEC.ENRR') {
      eduLookup[code].secondary = val;
    }
  });

  window.AppData.processed.eduLookup = eduLookup;

  // Add education rates to asylum countries (latest year snapshot)
  const latestYear = Math.max(...window.AppData.processed.years);
  const latest = window.AppData.processed.byYear[latestYear];

  if (latest) {
    Object.values(latest.byAsylum).forEach(country => {
      const eduData = eduLookup[country.code] || {};

      // fallback to UNHCR global rates (converted to %)
      country.primaryRate = eduData.primary || ENROLLMENT_RATES.PRIMARY * 100;
      country.secondaryRate = eduData.secondary || ENROLLMENT_RATES.SECONDARY * 100;

      // Derived metrics: estimated out-of-school (5–17)
      country.estInSchoolPrimary = Math.round(country.primary * (country.primaryRate / 100));
      country.estOutSchoolPrimary = country.primary - country.estInSchoolPrimary;

      country.estInSchoolSecondary = Math.round(country.secondary * (country.secondaryRate / 100));
      country.estOutSchoolSecondary = country.secondary - country.estInSchoolSecondary;

      country.estTotalOutSchool = country.estOutSchoolPrimary + country.estOutSchoolSecondary;
    });

    window.AppData.processed.byAsylum = latest.byAsylum;
    window.AppData.processed.byOrigin = latest.byOrigin;
    window.AppData.processed.flows = latest.flows;
  }
}

// ========================================================
// CALCULATE GLOBAL ESTIMATES FOR CHARTS (5–17 focus)
// ========================================================
function calculateGlobalEstimates() {
  const latestYear = Math.max(...window.AppData.processed.years);
  const data = window.AppData.processed.byYear[latestYear];
  if (!data) return;

  const t = data.totals;

  window.AppData.processed.global = {
    year: latestYear,

    // School-age (5–17) totals
    totalSchoolAge: t.totalSchoolAge,
    primaryAge: t.primaryAge,
    secondaryAge: t.secondaryAge,

    // Gender totals (5–17)
    totalBoys: t.totalBoys,
    totalGirls: t.totalGirls,

    boys511: t.male511,
    girls511: t.female511,
    boys1217: t.male1217,
    girls1217: t.female1217,

    // Estimated in/out of school (5–17) using UNHCR rates
    boysInSchool511: Math.round(t.male511 * ENROLLMENT_RATES.PRIMARY),
    boysOutSchool511: Math.round(t.male511 * (1 - ENROLLMENT_RATES.PRIMARY)),
    girlsInSchool511: Math.round(t.female511 * ENROLLMENT_RATES.PRIMARY),
    girlsOutSchool511: Math.round(t.female511 * (1 - ENROLLMENT_RATES.PRIMARY)),

    boysInSchool1217: Math.round(t.male1217 * ENROLLMENT_RATES.SECONDARY),
    boysOutSchool1217: Math.round(t.male1217 * (1 - ENROLLMENT_RATES.SECONDARY)),
    girlsInSchool1217: Math.round(t.female1217 * ENROLLMENT_RATES.SECONDARY),
    girlsOutSchool1217: Math.round(t.female1217 * (1 - ENROLLMENT_RATES.SECONDARY)),

    // Overall out-of-school estimate (5–17)
    totalInSchool: Math.round(t.totalSchoolAge * (1 - ENROLLMENT_RATES.OVERALL_OUT)),
    totalOutSchool: Math.round(t.totalSchoolAge * ENROLLMENT_RATES.OVERALL_OUT),
    outOfSchoolPercent: ENROLLMENT_RATES.OVERALL_OUT * 100
  };

  console.log(' Global Estimates:', window.AppData.processed.global);
}

// ========================================================
// UTILITIES
// ========================================================
window.showTooltip = function (event, html) {
  const tip = document.getElementById('tooltip');
  if (!tip) return;
  tip.innerHTML = html;
  tip.classList.add('visible');
  tip.style.left = (event.pageX + 15) + 'px';
  tip.style.top = (event.pageY - 10) + 'px';

  requestAnimationFrame(() => {
    const r = tip.getBoundingClientRect();
    if (r.right > window.innerWidth - 10) tip.style.left = (event.pageX - r.width - 15) + 'px';
    if (r.bottom > window.innerHeight - 10) tip.style.top = (event.pageY - r.height - 10) + 'px';
  });
};

window.hideTooltip = function () {
  const tip = document.getElementById('tooltip');
  if (tip) tip.classList.remove('visible');
};

window.formatNum = function (n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return n.toLocaleString();
};

// ========================================================
// NAVIGATION
// ========================================================
function initNav() {
  const nav = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 100);
  });

  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const t = document.querySelector(a.getAttribute('href'));
      if (t) t.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

// ========================================================
// INITIALIZE CHARTS
// ========================================================
function initCharts() {
  console.log(' Rendering charts...');

  if (window.renderStackedAreaChart) window.renderStackedAreaChart();
  if (window.renderHostRaceChart) window.renderHostRaceChart();
  if (window.renderFlowMap) window.renderFlowMap();
  if (window.renderDumbbellChart) window.renderDumbbellChart();
  if (window.renderResilienceBurdenScatter) window.renderResilienceBurdenScatter();
  if (window.renderWaffleChart) window.renderWaffleChart();
  if (window.renderTertiaryProgress) window.renderTertiaryProgress();
}

// ========================================================
// MAIN
// ========================================================
document.addEventListener('DOMContentLoaded', async () => {
  console.log(' Refugee Education Project - FINAL VERSION');
  console.log(' Data: child ages 0–17 available; education analysis focuses on 5–17');

  const ok = await loadData();

  if (ok) {
    initNav();
    setTimeout(() => {
      initCharts();
      document.getElementById('loadingOverlay')?.classList.add('hidden');
    }, 100);
  } else {
    const ol = document.getElementById('loadingOverlay');
    if (ol) ol.innerHTML = '<p style="color:#C62828;padding:50px;">Failed to load. Press F12 for console.</p>';
  }
});

window.addEventListener('resize', () => {
  clearTimeout(window._resizeTimer);
  window._resizeTimer = setTimeout(initCharts, 300);
});

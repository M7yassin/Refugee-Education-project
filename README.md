# The Refugee Education Project — "5.7 Million Empty Desks"

A small data storytelling website built with D3.js to communicate the refugee education crisis through interactive visuals.

The narrative focuses on **school-age refugee children (5–17)** and follows a simple thread:
scale → hosting burden → displacement routes → where education systems break (primary to secondary) → 2024 pressure points → what we can change.

## What’s in the story

The website is structured as six chapters:

1. **A Growing Baseline (2010–2024)**  
   Stacked area chart showing displaced children by age group: 0–4, 5–11, 12–17.

2. **Who Carries the Weight?**  
   Animated bar race of cumulative hosted school-age children (5–17) from 2010 to 2024.

3. **The Journey Is Mostly Regional**  
   Flow map of origin → host corridors, highlighting how displacement is largely regional.

4. **The Cliff Happens at Secondary**  
   Dumbbell (cliff) chart comparing primary vs secondary enrollment for top host countries, showing the drop-off.

5. **Pressure Points in 2024**  
   Scatter plot: hosted refugee adolescents (12–17) vs national out-of-school rate (secondary-age).  
   Used as a screening lens to identify “double burden” patterns.

6. **What We Can Change**  
   A waffle chart summarizing the global out-of-school share (UNHCR headline figure) plus a donut chart showing tertiary target progress.

## Data sources

This project combines three public sources:

- **UNHCR Population Statistics (2010–2024)**  
  Used for refugee child counts by age, origin, and asylum country.

- **UNESCO UIS national education indicators**  
  Enrollment and out-of-school indicators are **national**, not refugee-specific. They are used as context/proxies.

- **UNHCR Education Report 2025**  
  Used only for the global headline rates displayed in the summary section (e.g., overall out-of-school share).

Important note: **Refugee-specific education outcomes are rarely available at scale.**  
This project does not claim national rates measure refugee enrollment directly. They provide system context.

## Methodology (what the code actually does)

### Scope
- The analysis focuses on **school-age children (5–17)**.
- Ages **0–4** appear only in the baseline trend chapter for context.

### Cleaning and processing
- Demographics are binned into age groups: 0–4, 5–11, 12–17.
- The analysis uses **cross-border** records only (origin ≠ asylum).
- Aggregations are computed per year:
  - totals by age group
  - totals by host (asylum) country
  - totals by origin country
  - origin → host flows (very small flows are filtered to keep the map readable)

### Education indicators (UNESCO UIS / SDG dataset)
The education file contains **out-of-school rates (ROFST)**. Where the story needs an “in-school” view, the site uses a simple transformation:

- Primary-age out-of-school: `ROFST.1.CP`
  - In-school proxy: `100 − ROFST.1.CP`
- Secondary-age out-of-school (combined lower+upper): `ROFST.2T3.CP`
  - In-school proxy: `100 − ROFST.2T3.CP`

For the 2024 scatter, the project uses the **secondary-age out-of-school rate** as-is.

### No invented values
If an indicator is missing for a given country-year, it remains missing.  
Charts that require paired values show only countries with complete data for the selected year.

## Tech stack

- Vanilla HTML/CSS/JS
- D3.js v7
- TopoJSON + world-atlas for the map layer

No build step. No framework. Just a static site.

## Repository structure

refugee-education/
├─ index.html
├─ css/
│  └─ style.css
├─ js/
│  ├─ main.js
│  └─ charts/
│     ├─ stackedArea.js
│     ├─ hostRace.js
│     ├─ flowMap.js
│     ├─ dumbbell.js
│     ├─ resilienceScatter.js
│     ├─ waffle.js
│     └─ tertiaryProgress.js
├─ data/
│  ├─ clean_demographics.csv
│  ├─ clean_education.csv
│  ├─ demographics.csv
│  ├─ SDG_COUNTRY.csv
│  └─ SDG_DATA_NATIONAL.csv
├─ images/
│  └─ bgImg-unsplash.jpg
├─ data_cleaning.ipynb
└─ refugee-education-report-2025.pdf

## How to run locally

Because the website loads CSV files via `fetch()`, you need a local web server (opening the HTML file directly will not work in most browsers).

### Option 1: Python
```bash
cd refugee-education
python -m http.server 8000

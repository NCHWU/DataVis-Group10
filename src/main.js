const state = {
  data: [],
  filtered: [],
  years: { min: 1900, max: 2030 },
  timelineSelection: { min: 1900, max: 2030 },
  compare: [],
  selected: null,
  barcodeColors: {},
  scatterGenres: new Set(),
  deepDive: [],
  selectedRegions: new Set(),
  selectedGenres: new Set(),
  deepDiveHidden: new Set(),
};

const regionFilter = document.querySelector("#region-filter");
const genreFilter = document.querySelector("#genre-filter");
const resetBtn = document.querySelector("#reset-filters");
const searchInput = document.querySelector("#search-title");
const searchSuggestions = document.querySelector("#search-suggestions");
const compareAddBtn = document.querySelector("#compare-add");
const compareClearBtn = document.querySelector("#compare-clear");
const deepDiveClearBtn = document.querySelector("#deepdive-clear");
const matrixResetBtn = document.querySelector("#matrix-reset");
const timelineResetBtn = document.querySelector("#timeline-reset");
const colorPicker = document.querySelector("#color-wheel");
const colorSearchBtn = document.querySelector("#color-search-btn");
const selectAllBtn = document.querySelector("#selectAllBtn");

// document.getElementById("selectAllBtn").addEventListener("click", selectAllDeepDive);


window.addEventListener("DOMContentLoaded", () => {
  const title = document.getElementById("average_color_glyph-title");
  if (title) title.classList.remove("hidden");
});

async function loadData() {
  const candidates = [
    "./public/data/processed.json",
    "/public/data/processed.json",
    "./data/processed.json",
    "/data/processed.json",
    "./processed.json",
    "./public/data/sample_processed.json",
    "/public/data/sample_processed.json",
    "./data/sample_processed.json",
    "/data/sample_processed.json",
    "./sample_processed.json",
  ];
  for (const path of candidates) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) {
        console.warn(`Fetch failed for ${path}: ${res.status}`);
        continue;
      }
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        if (Array.isArray(json) && json.length) {
          console.log(`Loaded ${json.length} rows from ${path}`);
          return json;
        }
      } catch (err) {
        console.warn(`Unable to parse JSON from ${path}. Snippet:`, text.slice(0, 120));
      }
    } catch (err) {
      console.warn(`Unable to load ${path}`, err);
    }
  }
  throw new Error("No data file found. Run the prep script first.");
}

async function loadBarcodeColors() {
  const candidates = [
    "./public/data/movies_colors.json",
    "/public/data/movies_colors.json",
    "./data/movies_colors.json",
    "/data/movies_colors.json",
    "./movies_colors.json",
  ];

  for (const path of candidates) {
    try {
      console.log(`Attempting to load barcode colors from ${path}...`);
      const res = await fetch(path);
      if (!res.ok) {
        console.warn(`Fetch failed for ${path}: ${res.status}`);
        continue;
      }

      console.log(`Fetched ${path}, parsing JSON...`);
      const text = await res.text();
      console.log(`Downloaded ${(text.length / 1024 / 1024).toFixed(2)} MB of text data`);

      const data = JSON.parse(text);
      console.log(`Parsed JSON successfully, array length: ${Array.isArray(data) ? data.length : 'NOT AN ARRAY'}`);

      if (!Array.isArray(data)) {
        console.warn(`Invalid format in ${path} - not an array`);
        continue;
      }

      // Convert array to lookup object by title
      const lookup = {};
      data.forEach((movie, idx) => {
        if (movie.title) {
          lookup[movie.title] = {
            avg_colors: movie.avg_colors || [],
            overall_avg: movie.overall_avg || [0, 0, 0],
            four_opposites: movie.four_opposites || []
          };
        } else {
          if (idx < 5) console.warn(`Movie at index ${idx} has no title`);
        }
      });

      console.log(`Successfully loaded barcode colors for ${Object.keys(lookup).length} movies from ${path}`);
      console.log(`Sample titles:`, Object.keys(lookup).slice(0, 5));
      return lookup;
    } catch (err) {
      console.error(`Error loading ${path}:`, err);
      console.error(`Error details:`, err.message);
    }
  }

  console.warn("No barcode color file found. Barcode feature will be disabled.");
  return {};
}


function populateFilters(data) {
  const regions = Array.from(new Set(data.map((d) => regionLabel(d)))).filter(Boolean).sort();
  if (regionFilter) {
    regionFilter.innerHTML =
      `<option value=\"\">All regions</option>` +
      regions.map((r) => `<option value=\"${r}\">${r}</option>`).join("");
  }

  const genres = Array.from(new Set(data.flatMap((d) => d.genres || []))).sort();
  if (genreFilter) {
    genreFilter.innerHTML =
      `<option value=\"\">All genres</option>` +
      genres.map((g) => `<option value=\"${g}\">${g}</option>`).join("");
  }

  const years = data.map((d) => d.release_year).filter((y) => Number.isFinite(y));
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  state.years = { min: minYear, max: maxYear };
  state.timelineSelection = { min: minYear, max: maxYear };
}

function applyFilters() {
  const minYear = state.timelineSelection.min;
  const maxYear = state.timelineSelection.max;

  const source = baseDataForSelections();
  state.filtered = source.filter((d) => {
    return matchesYearRange(d, minYear, maxYear);
  });
  const filteredIds = new Set(state.filtered.map((d) => String(d.id)));
  state.deepDive = state.deepDive.filter((id) => filteredIds.has(String(id)));
  render();
}

function baseDataForSelections() {
  const hasRegions = state.selectedRegions.size > 0;
  const hasGenres = state.selectedGenres.size > 0;

  return state.data.filter((d) => {
    const matchesRegion = !hasRegions || state.selectedRegions.has(regionLabel(d));
    const matchesGenre =
      !hasGenres || (d.genres || []).some((g) => state.selectedGenres.has(g));
    return matchesRegion && matchesGenre;
  });
}

function matchesYearRange(d, minYear, maxYear) {
  return (!d.release_year && d.release_year !== 0) || (d.release_year >= minYear && d.release_year <= maxYear);
}

function regionLabel(d) {
  const reg = d.region && d.region !== "Other" && d.region !== "Unknown" ? d.region : null;
  const country = d.country && d.country !== "Unknown" ? d.country : null;
  return reg || country || "Unknown";
}

function render() {
  renderTitles();
  const minYear = state.timelineSelection.min;
  const maxYear = state.timelineSelection.max;
  const matrixData = state.data.filter((d) => matchesYearRange(d, minYear, maxYear));
  renderSummary(state.filtered);
  renderTimeline(baseDataForSelections());
  renderGenreRegionMatrix(matrixData);
  renderScatter(state.filtered);
  renderSearchResult(searchInput.value);
  renderCompare();
  renderTopRated();
  renderTopBudget();
  renderTopRevenue();
  renderTopViewership();
  renderDeepDiveSelection();
}


function currentRegionLabel() {
  if (!state.selectedRegions.size) return "All regions";
  const selected = Array.from(state.selectedRegions).sort();
  return selected.length <= 3 ? selected.join(", ") : `${selected.slice(0, 3).join(", ")} +${selected.length - 3}`;
}

function currentGenreLabel() {
  if (!state.selectedGenres.size) return "All genres";
  const selected = Array.from(state.selectedGenres).sort();
  return selected.length <= 3 ? selected.join(", ") : `${selected.slice(0, 3).join(", ")} +${selected.length - 3}`;
}

function currentYearRangeLabel() {
  const minYear = state.timelineSelection.min;
  const maxYear = state.timelineSelection.max;
  return `${minYear}–${maxYear}`;
}

function renderTitles() {
  const region = currentRegionLabel();
  const genre = currentGenreLabel();
  const years = currentYearRangeLabel();
  const overviewTitle = document.querySelector("#global-title");
  if (overviewTitle) {
    overviewTitle.textContent = "Manual Search";
  }
  const overviewSubhead = document.querySelector("#global-subhead");
  if (overviewSubhead) {
    overviewSubhead.textContent = "Search and select a title for a focused, single-movie deep dive.";
  }
  const timelineTitle = document.querySelector("#timeline-title");
  if (timelineTitle) {
    timelineTitle.textContent = `Timeline — ${genre} in ${region} (${years})`;
  }
}



function ensureAverageColorSVG() {
  const container = document.getElementById("average_color_glyph");
  if (!container) return null;

  container.innerHTML = "";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("id", "average-color-circle");
  svg.setAttribute("viewBox", "0 0 120 120");
  svg.setAttribute("width", "120");
  svg.setAttribute("height", "120");

  // optional center circle
  const center = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  center.setAttribute("cx", 60);
  center.setAttribute("cy", 60);
  center.setAttribute("r", 25);
  center.setAttribute("fill", "#2b3344");
  svg.appendChild(center);

  container.appendChild(svg);
  return svg;
}

function computeAverageColorData(movieIds) {
  const colors = movieIds
    .map(id => {
      const movie = state.data.find(d => String(d.id) === String(id));
      return movie ? state.barcodeColors[movie.title] : null;
    })
    .filter(d => d && Array.isArray(d.four_opposites) && Array.isArray(d.overall_avg));

  if (!colors.length) return null;

  const avgOverall = colors.reduce(
    (acc, c) => {
      acc[0] += c.overall_avg[0];
      acc[1] += c.overall_avg[1];
      acc[2] += c.overall_avg[2];
      return acc;
    },
    [0, 0, 0]
  ).map(v => v / colors.length);

  const avgFourOpposites = [0, 1, 2, 3].map(i => {
    const sum = colors.reduce(
      (acc, c) => {
        acc[0] += c.four_opposites[i][0];
        acc[1] += c.four_opposites[i][1];
        acc[2] += c.four_opposites[i][2];
        return acc;
      },
      [0, 0, 0]
    );
    return sum.map(v => v / colors.length);
  });

  return {
    overall_avg: avgOverall,
    four_opposites: avgFourOpposites
  };
}

function renderSummary(data) {
  const container = document.querySelector("#summary-grid");
  if (!container) return;
  container.innerHTML = "";
  if (!data.length) {
    container.innerHTML = "<p class=\"muted\">No data for current filters.</p>";
    return;
  }

  const count = data.length;
  const avgRating = d3.mean(data, (d) => d.rating) || 0;
  const avgBudget = d3.mean(data, (d) => d.budget) || 0;
  const topRegion = d3.rollups(
    data,
    (v) => v.length,
    (d) => d.region || "Unknown"
  ).sort((a, b) => d3.descending(a[1], b[1]))[0];

  const stats = [
    { label: "Titles", value: count },
    { label: "Avg rating", value: avgRating.toFixed(2) },
    { label: "Avg budget", value: `$${(avgBudget / 1_000_000).toFixed(1)}M` },
    { label: "Top region", value: topRegion ? `${topRegion[0]} (${topRegion[1]})` : "—" },
  ];

  stats.forEach((s) => {
    const el = document.createElement("div");
    el.className = "stat";
    el.innerHTML = `<p>${s.label}</p><h3>${s.value}</h3>`;
    container.appendChild(el);
  });
}

function renderTimeline(data) {
  const container = d3.select("#timeline");
  container.selectAll("*").remove();
  if (!data.length) {
    container.append("div").text("No data for current filters.");
    return;
  }

  const selectedMin = state.timelineSelection.min;
  const selectedMax = state.timelineSelection.max;
  const selectedData = data.filter(
    (d) =>
      (!d.release_year && d.release_year !== 0) ||
      (d.release_year >= selectedMin && d.release_year <= selectedMax)
  );
  const avgBudget = d3.mean(selectedData, (d) => d.budget) || 0;
  const avgRating = d3.mean(selectedData, (d) => d.rating) || 0;

  const summaryNode = container
    .append("div")
    .attr("class", "timeline-summary")
    .text(
      `Selected ${selectedMin}–${selectedMax} • Avg budget $${(avgBudget / 1_000_000).toFixed(1)}M • Avg rating ${
        avgRating ? avgRating.toFixed(2) : "—"
      }`
    );

  const genreLabel = genreFilter && genreFilter.value ? `${genreFilter.value}` : "All genres";

  const agg = d3
    .rollups(
      data,
      (v) => ({
        avgBudget: d3.mean(v, (d) => d.budget),
        avgRating: d3.mean(v, (d) => d.rating),
      }),
      (d) => +d.release_year
    )
    .filter(([year]) => !Number.isNaN(year))
    .sort((a, b) => a[0] - b[0]);

  const containerNode = container.node();
  const width = containerNode.clientWidth || 600;
  const height = containerNode.clientHeight || 320;
  const summaryHeight = summaryNode.node().getBoundingClientRect().height || 0;
  const chartHeight = Math.max(260, height - summaryHeight - 12);
  const margin = { top: 70, right: 50, bottom: 36, left: 50 };

  const svg = container.append("svg").attr("width", width).attr("height", chartHeight);
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = chartHeight - margin.top - margin.bottom;

  const x = d3
    .scaleLinear()
    .domain(d3.extent(agg, (d) => d[0]))
    .range([margin.left, margin.left + innerWidth]);

  const yBudget = d3
    .scaleLinear()
    .domain([0, d3.max(agg, (d) => d[1].avgBudget || 0) * 1.1 || 1])
    .range([margin.top + innerHeight, margin.top]);

  const yRating = d3.scaleLinear().domain([0, 10]).range([margin.top + innerHeight, margin.top]);

  const budgetLine = d3
    .line()
    .x((d) => x(d[0]))
    .y((d) => yBudget(d[1].avgBudget || 0));

  const ratingLine = d3
    .line()
    .x((d) => x(d[0]))
    .y((d) => yRating(d[1].avgRating || 0));

  svg
    .append("path")
    .datum(agg)
    .attr("fill", "none")
    .attr("stroke", "#4ee1a0")
    .attr("stroke-width", 2)
    .attr("d", budgetLine);

  svg
    .append("path")
    .datum(agg)
    .attr("fill", "none")
    .attr("stroke", "#3cb4ff")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "5,3")
    .attr("d", ratingLine);

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${margin.top + innerHeight})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")));

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(yBudget).ticks(5).tickFormat((d) => `$${(d / 1_000_000).toFixed(0)}M`));

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${width - margin.right},0)`)
    .call(d3.axisRight(yRating).ticks(5));

  svg
    .append("text")
    .attr("x", margin.left)
    .attr("y", margin.top - 58)
    .text(`Budget (left) • Rating (right) — ${genreLabel}`);

  // Legend
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top - 52})`)
    .append("foreignObject")
    .attr("width", 260)
    .attr("height", 40)
    .html(
      `<div class="legend"><span class="swatch" style="background:#4ee1a0"></span>Budget` +
        `<span class="swatch" style="background:#3cb4ff"></span>Rating</div>`
    );

  // Interactive hover
  const tooltip = container
    .append("div")
    .attr("class", "timeline-tooltip")
    .style("opacity", 0);

  const focus = svg.append("g").style("display", "none");
  focus.append("line").attr("class", "hover-line").attr("stroke", "#fff").attr("stroke-opacity", 0.25).attr("y1", margin.top).attr("y2", margin.top + innerHeight);
  const focusBudget = focus.append("circle").attr("r", 6).attr("fill", "#4ee1a0").attr("stroke", "#0c0f1a").attr("stroke-width", 2);
  const focusRating = focus.append("circle").attr("r", 6).attr("fill", "#3cb4ff").attr("stroke", "#0c0f1a").attr("stroke-width", 2);

  const bisect = d3.bisector((d) => d[0]).center;

  const labelGroup = svg.append("g").attr("class", "brush-label");
  const startLabel = labelGroup
    .append("text")
    .attr("y", margin.top - 18)
    .attr("text-anchor", "middle")
    .attr("fill", "rgba(255, 255, 255, 0.6)")
    .attr("font-size", "12px");

  const endLabel = labelGroup
    .append("text")
    .attr("y", margin.top - 18)
    .attr("text-anchor", "middle")
    .attr("fill", "rgba(255, 255, 255, 0.6)")
    .attr("font-size", "12px");

  const setRangeLabels = (minYear, maxYear) => {
    startLabel.attr("x", x(minYear)).text(minYear);
    endLabel.attr("x", x(maxYear)).text(maxYear);
  };

  setRangeLabels(selectedMin, selectedMax);

  // Add brush for time range selection
  const brush = d3.brushX()
    .extent([[margin.left, margin.top], [margin.left + innerWidth, margin.top + innerHeight]])
    .on("brush", (event) => {
      if (!event.selection) return;
      const [x0, x1] = event.selection;
      const minYear = Math.round(x.invert(x0));
      const maxYear = Math.round(x.invert(x1));
      setRangeLabels(minYear, maxYear);
    })
    .on("end", (event) => {
      if (!event.sourceEvent) {
        return;
      }
      if (!event.selection) {
        // Reset to full range if brush cleared
        state.timelineSelection = { min: state.years.min, max: state.years.max };
        setRangeLabels(state.years.min, state.years.max);
      } else {
        const [x0, x1] = event.selection;
        const minYear = Math.round(x.invert(x0));
        const maxYear = Math.round(x.invert(x1));
        state.timelineSelection = { min: minYear, max: maxYear };
        setRangeLabels(minYear, maxYear);
      }
      applyFilters();
    });

  // Add brush group
  svg.append("g")
    .attr("class", "brush")
    .call(brush);

  // Style brush - subtle appearance
  svg.selectAll(".brush .overlay")
    .style("cursor", "crosshair");

  svg.selectAll(".brush .selection")
    .attr("fill", "rgba(255, 255, 255, 0.08)")
    .attr("stroke", "rgba(255, 255, 255, 0.25)")
    .attr("stroke-width", 1);

  svg.selectAll(".brush .handle")
    .attr("fill", "rgba(255, 255, 255, 0.4)")
    .attr("stroke", "rgba(0, 0, 0, 0.3)")
    .attr("stroke-width", 1);

  // Initial brush position based on current selection
  if (state.timelineSelection.min !== state.years.min || state.timelineSelection.max !== state.years.max) {
    const x0 = x(state.timelineSelection.min);
    const x1 = x(state.timelineSelection.max);
    svg.select(".brush").call(brush.move, [x0, x1]);
  }

  // Tooltip on hover (still show data values when hovering)
  svg
    .select(".brush .overlay")
    .on("mousemove", (event) => {
      const [mx] = d3.pointer(event, svg.node());
      const year = Math.round(x.invert(mx));
      const idx = bisect(agg, year);
      const d = agg[Math.max(0, Math.min(idx, agg.length - 1))];
      if (!d) return;
      const yearVal = d[0];
      const vals = d[1];
      focus.style("display", null);
      focus.select(".hover-line").attr("x1", x(yearVal)).attr("x2", x(yearVal));
      focusBudget.attr("cx", x(yearVal)).attr("cy", yBudget(vals.avgBudget || 0));
      focusRating.attr("cx", x(yearVal)).attr("cy", yRating(vals.avgRating || 0));
      tooltip
        .style("opacity", 1)
        .style("left", `${x(yearVal)}px`)
        .style("top", `${margin.top + 10}px`)
        .html(
          `<strong>${yearVal}</strong><br/>` +
            `Budget: $${(vals.avgBudget / 1_000_000 || 0).toFixed(1)}M<br/>` +
            `Rating: ${vals.avgRating ? vals.avgRating.toFixed(2) : "—"}`
        );
    })
    .on("mouseleave", () => {
      focus.style("display", "none");
      tooltip.style("opacity", 0);
    });
}

function renderScatter(data) {
  const container = d3.select("#scatter");
  container.selectAll("*").remove();
  if (!data.length) {
    container.append("div").text("No data for current filters.");
    return;
  }

  const filtered = data.filter((d) => d.budget > 0 && d.rating);
  const visible = filtered;

  // Downsample if very dense to keep plot readable.
  const maxPoints = 1000;
  const step = Math.max(1, Math.ceil(visible.length / maxPoints));
  const plotted = visible.filter((_, i) => i % step === 0);

  const width = container.node().clientWidth || 600;
  const height = container.node().clientHeight || 580;
  const svgHeight = Math.max(500, height - 30);
  const margin = { top: 20, right: 20, bottom: 40, left: 55 };

  const svg = container.append("svg").attr("width", width).attr("height", svgHeight);

  const x = d3
    .scaleLinear()
    .domain([0, d3.max(plotted, (d) => d.budget) * 1.1 || 1])
    .range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, 10]).range([svgHeight - margin.bottom, margin.top]);

  const xAxis = svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${svgHeight - margin.bottom})`)
    .call(d3.axisBottom(x).tickFormat((d) => `$${(d / 1_000_000).toFixed(0)}M`));

  const yAxis = svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));

  const clipId = `scatter-clip-${Math.random().toString(36).slice(2)}`;
  svg.append("clipPath")
    .attr("id", clipId)
    .append("rect")
    .attr("x", margin.left)
    .attr("y", margin.top)
    .attr("width", width - margin.left - margin.right)
    .attr("height", svgHeight - margin.top - margin.bottom);

  const plot = svg.append("g")
    .attr("class", "scatter-plot")
    .attr("clip-path", `url(#${clipId})`);

  const tooltip = container
    .append("div")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("background", "rgba(15, 20, 35, 0.95)")
    .style("padding", "0.5rem 0.7rem")
    .style("border-radius", "10px")
    .style("border", "1px solid rgba(255, 255, 255, 0.1)")
    .style("color", "#fff")
    .style("font-size", "12px")
    .style("box-shadow", "0 8px 24px rgba(0, 0, 0, 0.4)")
    .style("backdrop-filter", "blur(8px)")
    .style("opacity", 0)
    .style("transition", "opacity 0.15s ease");

  let zx = x;
  let zy = y;
  let currentZoomScale = 1;

  // Helper function to create arc path for quadrants
  const createQuadrantArcPath = (centerX, centerY, startAngle, endAngle, innerR, outerR) => {
    const startAngleRad = (startAngle - 90) * Math.PI / 180;
    const endAngleRad = (endAngle - 90) * Math.PI / 180;

    const x1 = centerX + innerR * Math.cos(startAngleRad);
    const y1 = centerY + innerR * Math.sin(startAngleRad);
    const x2 = centerX + outerR * Math.cos(startAngleRad);
    const y2 = centerY + outerR * Math.sin(startAngleRad);
    const x3 = centerX + outerR * Math.cos(endAngleRad);
    const y3 = centerY + outerR * Math.sin(endAngleRad);
    const x4 = centerX + innerR * Math.cos(endAngleRad);
    const y4 = centerY + innerR * Math.sin(endAngleRad);

    return `
      M ${x1} ${y1}
      L ${x2} ${y2}
      A ${outerR} ${outerR} 0 0 1 ${x3} ${y3}
      L ${x4} ${y4}
      A ${innerR} ${innerR} 0 0 0 ${x1} ${y1}
      Z
    `;
  };

  // Function to update visualization based on zoom level
  const updateVisualization = (zoomScale) => {
    // Threshold: show quadrants when zoom is > 2.5x
    const ZOOM_THRESHOLD = 2.5;
    const showQuadrants = zoomScale >= ZOOM_THRESHOLD;

    // Base size that scales with zoom - smaller glyphs to reduce overlap
    const baseQuadrantSize = 8; // Reduced from 12
    const quadrantRadius = baseQuadrantSize * zoomScale;
    const innerRadius = quadrantRadius * 0.2;
    const outerRadius = quadrantRadius * 0.38;
    const centerCircleRadius = showQuadrants ? 2 * zoomScale : 5; // Smaller center

    const angles = [
      { start: 0, end: 90 },      // Top-right
      { start: 90, end: 180 },    // Bottom-right
      { start: 180, end: 270 },   // Bottom-left
      { start: 270, end: 360 }    // Top-left
    ];

    // Remove existing quadrants
    plot.selectAll(".quadrant-group").remove();

    if (showQuadrants) {
      // Create quadrant groups for each point with reduced opacity
      plotted.forEach((d) => {
        const colorData = state.barcodeColors[d.title];
        if (colorData && colorData.four_opposites && colorData.four_opposites.length >= 4) {
          const colors = colorData.four_opposites.map(rgb =>
            `rgb(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])})`
          );

          const quadrantGroup = plot.append("g")
            .attr("class", "quadrant-group")
            .attr("transform", `translate(${zx(d.budget)}, ${zy(d.rating)})`)
            .style("pointer-events", "none");

          angles.forEach((angle, i) => {
            quadrantGroup.append("path")
              .attr("d", createQuadrantArcPath(0, 0, angle.start, angle.end, innerRadius, outerRadius))
              .attr("class", "color-arc")
              .attr("fill", colors[i])
              .attr("stroke", "rgba(255, 255, 255, 0.3)")
              .attr("stroke-width", "0.5");
          });
        }
      });
    }

    // Get current selected IDs (dynamic for re-renders)
    const selectedIds = new Set(state.deepDive.map((id) => String(id)));

    // Update circles with proper scaling - always use movie's average color
    plot.selectAll("circle")
      .attr("r", centerCircleRadius)
      .attr("fill", (d) => averageMovieColor(d))
      .attr("fill-opacity", 0.9)
      .attr("stroke", (d) => (selectedIds.has(String(d.id)) ? "rgba(255, 255, 255, 0.8)" : "rgba(255,255,255,0.15)"))
      .attr("stroke-width", (d) => (selectedIds.has(String(d.id)) ? 2 * zoomScale : 0.5));
  };

  // Initial render of circles
  plot
    .selectAll("circle")
    .data(plotted)
    .join("circle")
    .attr("cx", (d) => zx(d.budget))
    .attr("cy", (d) => zy(d.rating))
    .attr("r", 5)
    .attr("fill", (d) => averageMovieColor(d))
    .attr("fill-opacity", 0.85)
    .style("cursor", "pointer")
    .style("filter", "drop-shadow(0 0 2px rgba(255, 255, 255, 0.3))")
    .attr("stroke", (d) => (new Set(state.deepDive.map((id) => String(id))).has(String(d.id)) ? "rgba(255, 255, 255, 0.8)" : "rgba(255,255,255,0.15)"))
    .attr("stroke-width", (d) => (new Set(state.deepDive.map((id) => String(id))).has(String(d.id)) ? 2 : 0.5))
    .on("mouseenter", (event, d) => {
      const xPos = zx(d.budget);
      const yPos = zy(d.rating);
      tooltip
        .style("opacity", 1)
        .style("left", `${xPos + 12}px`)
        .style("top", `${yPos}px`)
        .html(
          `<strong>${d.title}</strong><br/>Budget: $${(d.budget / 1_000_000).toFixed(1)}M<br/>Rating: ${d.rating}`
        );
    })
    .on("click", (event, d) => {
      event.stopPropagation(); // Prevent event bubbling
      const id = d.id;
      const existing = state.deepDive.findIndex((m) => String(m) === String(id));
      if (existing >= 0) {
        state.deepDive.splice(existing, 1);
      } else {
        state.deepDive.push(id);
      }
      // Update only the deep dive panel, don't re-render scatter (preserves zoom)
      renderDeepDiveSelection();
      // Update visualization to reflect new selection
      updateVisualization(currentZoomScale);
    })
    .on("mouseleave", () => tooltip.style("opacity", 0));

  svg
    .append("text")
    .attr("x", margin.left)
    .attr("y", margin.top - 6)
    .text("Budget vs. Rating");

  // Add description below the plot
  container
    .append("p")
    .attr("class", "muted")
    .style("margin-top", "0.5rem")
    .style("font-size", "12px")
    .text("Scroll to zoom • Drag to pan • Ctrl+drag to select multiple • Click point to select");

  // Zoom for panning and zooming (default behavior)
  const zoom = d3.zoom()
    .scaleExtent([1, 6])
    .translateExtent([[margin.left, margin.top], [width - margin.right, svgHeight - margin.bottom]])
    .extent([[margin.left, margin.top], [width - margin.right, svgHeight - margin.bottom]])
    .filter((event) => {
      // Allow zoom/pan only when Ctrl is NOT pressed (let brush handle Ctrl+drag)
      // Also allow wheel events for zooming
      if (event.type === 'wheel') return true;
      if (event.ctrlKey) return false;
      return true;
    })
    .on("zoom", (event) => {
      zx = event.transform.rescaleX(x);
      zy = event.transform.rescaleY(y);
      currentZoomScale = event.transform.k;

      xAxis.call(d3.axisBottom(zx).tickFormat((d) => `$${(d / 1_000_000).toFixed(0)}M`));
      yAxis.call(d3.axisLeft(zy));

      plot.selectAll("circle")
        .attr("cx", (d) => zx(d.budget))
        .attr("cy", (d) => zy(d.rating));

      // Update quadrants with new positions and scale
      updateVisualization(currentZoomScale);
    });

  svg.call(zoom);

  // Prevent page scroll when mouse is over the scatter plot
  svg.on("wheel", (event) => {
    event.preventDefault();
  });

  // Brush for drag-select (only activates with Ctrl key)
  const brush = d3.brush()
    .extent([[margin.left, margin.top], [width - margin.right, svgHeight - margin.bottom]])
    .filter((event) => {
      // Only allow brush when Ctrl key is pressed
      return event.ctrlKey;
    })
    .on("start", (event) => {
      // Only start if Ctrl is pressed
      if (!event.sourceEvent || !event.sourceEvent.ctrlKey) {
        svg.select(".brush").call(brush.move, null);
      }
    })
    .on("end", (event) => {
      if (!event.selection) return;
      const [[x0, y0], [x1, y1]] = event.selection;

      const newlySelected = plotted.filter(d => {
        const cx = zx(d.budget);
        const cy = zy(d.rating);
        return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
      });

      newlySelected.forEach(movie => {
        if (!state.deepDive.some(id => String(id) === String(movie.id))) {
          state.deepDive.push(movie.id);
        }
      });

      svg.select(".brush").call(brush.move, null);
      // Update visualization without full re-render to preserve zoom
      renderDeepDiveSelection();
      updateVisualization(currentZoomScale);
    });

  // Add brush group on top of zoom
  const brushGroup = svg.append("g")
    .attr("class", "brush")
    .call(brush);

  // Make brush overlay ignore pointer events unless Ctrl is pressed
  // This allows clicks to pass through to circles
  brushGroup.select(".overlay")
    .style("pointer-events", "none");

  // Listen for Ctrl key to toggle brush interactivity
  d3.select("body")
    .on("keydown.scatterbrush", (event) => {
      if (event.key === "Control") {
        brushGroup.select(".overlay").style("pointer-events", "all");
      }
    })
    .on("keyup.scatterbrush", (event) => {
      if (event.key === "Control") {
        brushGroup.select(".overlay").style("pointer-events", "none");
      }
    });
}

function parseMetric(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function colorKey(rgb) {
  return `${rgb[0]},${rgb[1]},${rgb[2]}`;
}

function adjustColor(rgb, factor) {
  return rgb.map((v) => clamp(Math.round(v * factor), 20, 240));
}

function averageMovieColor(movie) {
  const fallback = "rgb(120, 140, 170)";
  if (!movie || !movie.title) return fallback;
  const colorData = state.barcodeColors[movie.title];
  if (!colorData || !Array.isArray(colorData.overall_avg)) return fallback;
  const rgb = colorData.overall_avg.map((v) => clamp(Math.round(v), 20, 235));
  if (rgb.length < 3) return fallback;
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function hexToRgb(hex) {
const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
return result ? [
  parseInt(result[1], 16),
  parseInt(result[2], 16),
  parseInt(result[3], 16)
] : null;
}

  function findMoviesByColor(hexColor) {
    const targetRgb = hexToRgb(hexColor);
    if (!targetRgb) return;

    const maxDistance = 100
      console.log(state.deepDive)
    // Filter movies that have color data
        const selectedIds = new Set(state.deepDive); // keep current selection
  const candidates = state.data.filter(m => selectedIds.has(m.id) && state.barcodeColors[m.title]);

    // const candidates = state.data.filter(m => state.deepDive[m.title]);   // hier aanpassen alleen selectie
    console.log(candidates)
    // Calculate distance and sort
    const matches = candidates.map(movie => {
      const movieColor = state.barcodeColors[movie.title].overall_avg;
      if (!movieColor) return null;
      // Euclidean distance in RGB space
      const dist = Math.sqrt(
        Math.pow(movieColor[0] - targetRgb[0], 2) +
        Math.pow(movieColor[1] - targetRgb[1], 2) +
        Math.pow(movieColor[2] - targetRgb[2], 2)
      );
      return { id: movie.id, dist };
    })

    .filter(m => m.dist <= maxDistance)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 50);

     console.log(matches)
    state.deepDive = matches.map(m => m.id);
    renderDeepDiveSelection();
    renderScatter(state.filtered);
  }


function kMeansColors(colors, k) {
  if (!colors.length) return [];
  const unique = [];
  const seen = new Set();
  colors.forEach((c) => {
    const key = colorKey(c);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(c);
    }
  });

  if (unique.length <= k) {
    const result = [...unique];
    let idx = 0;
    const factors = [1.15, 0.9, 1.25, 0.75, 1.05];
    while (result.length < k) {
      const base = unique[idx % unique.length];
      result.push(adjustColor(base, factors[idx % factors.length]));
      idx += 1;
    }
    return result.slice(0, k);
  }

  let centers = unique.slice(0, k).map((c) => [...c]);
  for (let iter = 0; iter < 8; iter += 1) {
    const clusters = Array.from({ length: k }, () => []);
    colors.forEach((c) => {
      let best = 0;
      let bestDist = Infinity;
      centers.forEach((center, i) => {
        const dr = c[0] - center[0];
        const dg = c[1] - center[1];
        const db = c[2] - center[2];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      clusters[best].push(c);
    });

    centers = centers.map((center, i) => {
      const cluster = clusters[i];
      if (!cluster.length) {
        return [...colors[Math.floor(Math.random() * colors.length)]];
      }
      const sums = cluster.reduce(
        (acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]],
        [0, 0, 0]
      );
      return sums.map((s) => Math.round(s / cluster.length));
    });
  }

  return centers;
}

function renderGenreRegionMatrix(data) {
  const container = d3.select("#matrix");
  container.selectAll("*").remove();
  if (!data.length) {
    container.append("div").text("No data for current filters.");
    return;
  }

  const regions = Array.from(new Set(data.map((d) => regionLabel(d)))).filter(Boolean).sort();
  const genres = Array.from(new Set(data.flatMap((d) => d.genres || []))).filter(Boolean).sort();

  if (!regions.length || !genres.length) {
    container.append("div").text("No region/genre data available.");
    return;
  }

  const keyFor = (genre, region) => `${genre}||${region}`;
  const stats = new Map();

  data.forEach((movie) => {
    const region = regionLabel(movie);
    const movieGenres = movie.genres && movie.genres.length ? movie.genres : ["Unknown"];
    const colorData = state.barcodeColors[movie.title];
    const opposites = colorData && Array.isArray(colorData.four_opposites) ? colorData.four_opposites : null;

    movieGenres.forEach((genre) => {
      const key = keyFor(genre, region);
      const current = stats.get(key) || { count: 0, colors: [] };
      current.count += 1;
      if (opposites && opposites.length) {
        opposites.forEach((rgb) => {
          if (!rgb || rgb.length < 3) return;
          const r = Math.round(rgb[0]);
          const g = Math.round(rgb[1]);
          const b = Math.round(rgb[2]);
          current.colors.push([r, g, b]);
        });
      }
      stats.set(key, current);
    });
  });

  const activeRegions = regions;
  const activeGenres = genres;

  const cellSize = 36;
  const margin = { top: 70, right: 20, bottom: 20, left: 140 };
  const width = margin.left + activeRegions.length * cellSize + margin.right;
  const height = margin.top + activeGenres.length * cellSize + margin.bottom;

  const svg = container.append("svg").attr("width", width).attr("height", height);

  const x = d3.scaleBand().domain(activeRegions).range([margin.left, margin.left + activeRegions.length * cellSize]).padding(0.08);
  const y = d3.scaleBand().domain(activeGenres).range([margin.top, margin.top + activeGenres.length * cellSize]).padding(0.08);

  svg
    .append("g")
    .attr("class", "matrix-axis")
    .attr("transform", `translate(0,${margin.top - 10})`)
    .call(d3.axisTop(x).tickSize(0))
    .selectAll("text")
    .attr("text-anchor", "start")
    .attr("transform", "rotate(-35)")
    .style("cursor", "pointer")
    .attr("class", (d) => (state.selectedRegions.has(d) ? "active" : ""))
    .on("click", (_, region) => {
      if (state.selectedRegions.has(region)) {
        state.selectedRegions.delete(region);
      } else {
        state.selectedRegions.add(region);
      }
      applyFilters();
    });

  svg
    .append("g")
    .attr("class", "matrix-axis")
    .attr("transform", `translate(${margin.left - 10},0)`)
    .call(d3.axisLeft(y).tickSize(0))
    .selectAll("text")
    .style("cursor", "pointer")
    .attr("class", (d) => (state.selectedGenres.has(d) ? "active" : ""))
    .on("click", (_, genre) => {
      if (state.selectedGenres.has(genre)) {
        state.selectedGenres.delete(genre);
      } else {
        state.selectedGenres.add(genre);
      }
      applyFilters();
    });

  const cells = [];
  activeGenres.forEach((genre) => {
    activeRegions.forEach((region) => {
      const key = keyFor(genre, region);
      const entry = stats.get(key) || { count: 0, colors: [] };
      const usableColors = entry.colors.filter((c) => c[0] + c[1] + c[2] > 30);
      const sourceColors = usableColors.length ? usableColors : entry.colors;
      const centers = kMeansColors(sourceColors, 4);
      const topColors = centers.length
        ? centers.map((c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`)
        : ["rgb(20, 24, 35)", "rgb(20, 24, 35)", "rgb(20, 24, 35)", "rgb(20, 24, 35)"];
      cells.push({
        genre,
        region,
        count: entry.count,
        colors: topColors,
      });
    });
  });

  const cellGroup = svg.append("g");
  const cell = cellGroup
    .selectAll("g")
    .data(cells)
    .join("g")
    .attr("class", "matrix-cell")
    .attr("transform", (d) => `translate(${x(d.region)},${y(d.genre)})`);

  const quadW = x.bandwidth() / 2;
  const quadH = y.bandwidth() / 2;
  cell
    .append("rect")
    .attr("width", quadW)
    .attr("height", quadH)
    .attr("x", 0)
    .attr("y", 0)
    .attr("fill", (d) => d.colors[0]);
  cell
    .append("rect")
    .attr("width", quadW)
    .attr("height", quadH)
    .attr("x", quadW)
    .attr("y", 0)
    .attr("fill", (d) => d.colors[1]);
  cell
    .append("rect")
    .attr("width", quadW)
    .attr("height", quadH)
    .attr("x", 0)
    .attr("y", quadH)
    .attr("fill", (d) => d.colors[2]);
  cell
    .append("rect")
    .attr("width", quadW)
    .attr("height", quadH)
    .attr("x", quadW)
    .attr("y", quadH)
    .attr("fill", (d) => d.colors[3]);

  cell
    .append("rect")
    .attr("class", "matrix-border")
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("rx", 6)
    .attr("fill", "transparent")
    .attr("stroke", (d) => {
      const regionActive = state.selectedRegions.has(d.region);
      const genreActive = state.selectedGenres.has(d.genre);
      if (regionActive && genreActive) return "rgba(255, 255, 255, 0.5)";
      if (regionActive || genreActive) return "rgba(255, 255, 255, 0.25)";
      return "rgba(255,255,255,0.06)";
    })
    .attr("stroke-width", (d) => {
      const regionActive = state.selectedRegions.has(d.region);
      const genreActive = state.selectedGenres.has(d.genre);
      if (regionActive && genreActive) return 2;
      if (regionActive || genreActive) return 1.5;
      return 1;
    });

  cell
    .on("click", (_, d) => {
      if (!state.selectedRegions.has(d.region)) {
        state.selectedRegions.add(d.region);
      }
      if (!state.selectedGenres.has(d.genre)) {
        state.selectedGenres.add(d.genre);
      }
      applyFilters();
    })
    .style("cursor", "pointer");

  cell
    .append("text")
    .attr("x", x.bandwidth() / 2)
    .attr("y", y.bandwidth() / 2 + 4)
    .attr("text-anchor", "middle")
    .text((d) => d.count || "");
}

function renderSearchResult(query) {
  const source = state.data;
  if (!searchSuggestions) return;
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    searchSuggestions.innerHTML = "";
    state.selected = null;
    return;
  }
  const matches = source.filter((d) => (d.title || "").toLowerCase().includes(q)).slice(0, 6);
  searchSuggestions.innerHTML = matches
    .map((m) => `<li data-id="${m.id}">${m.title} (${m.release_year || "—"})</li>`)
    .join("");
  searchSuggestions.querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", () => {
      const id = li.getAttribute("data-id");
      const picked = source.find((d) => String(d.id) === String(id));
          if (picked) {
            state.selected = picked;
            if (!state.deepDive.includes(picked.id)) {
              state.deepDive.push(picked.id);
              renderDeepDiveSelection();
            }
          }
        });
  });
  if (!matches.length) {
    state.selected = null;
  }
}

function renderBarcode(avgColors, containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container || !avgColors || avgColors.length === 0) {
    if (container) {
      container.innerHTML = '<p class="muted">Barcode data not available</p>';
    }
    return;
  }

  // Clear previous barcode
  container.innerHTML = '';

  // Create canvas
  const canvas = document.createElement('canvas');
  const numColors = avgColors.length;
  canvas.width = numColors;
  canvas.height = 100;
  canvas.style.width = '100%';
  canvas.style.height = '100px';
  canvas.style.imageRendering = 'pixelated'; // Keep colors crisp when scaled

  const ctx = canvas.getContext('2d');

  // Draw each color as a 1px wide vertical stripe
  avgColors.forEach((rgb, x) => {
    const r = Math.round(rgb[0]);
    const g = Math.round(rgb[1]);
    const b = Math.round(rgb[2]);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(x, 0, 1, 100);
  });

  container.appendChild(canvas);
}

function renderColorSwatches(colorData, containerSelector) {
  const swatchContainer = document.querySelector(containerSelector);
  if (!swatchContainer || !colorData || !Array.isArray(colorData.four_opposites)) {
    return;
  }
  swatchContainer.innerHTML = "";
  colorData.four_opposites.forEach((rgb) => {
    const swatch = document.createElement("div");
    swatch.className = "swatch";
    const r = Math.round(rgb[0]);
    const g = Math.round(rgb[1]);
    const b = Math.round(rgb[2]);
    swatch.style.background = `rgb(${r}, ${g}, ${b})`;
    swatch.title = `RGB(${r}, ${g}, ${b})`;
    swatchContainer.appendChild(swatch);
  });
}

function renderColorCircle(colorData, svgSelector) {
  const svg = document.querySelector(svgSelector);
  if (!svg || !colorData || !Array.isArray(colorData.four_opposites) || colorData.four_opposites.length < 4) {
    return;
  }

  svg.querySelectorAll(".color-arc").forEach((node) => node.remove());

  const colors = colorData.four_opposites.map(rgb =>
    `rgb(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])})`
  );

  // Create four arc pieces around the center circle
  // Each piece is a 90-degree arc positioned around the circle
  const viewBox = svg.getAttribute("viewBox");
  const [_, __, vbWidth, vbHeight] = viewBox ? viewBox.split(/\s+/).map(Number) : [0, 0, 120, 120];
  const size = Math.min(vbWidth || 120, vbHeight || 120);
  const centerX = (vbWidth || 120) / 2;
  const centerY = (vbHeight || 120) / 2;
  const innerRadius = size * 0.23;
  const outerRadius = size * 0.42;

  // Function to create SVG path for an arc piece
  const createArcPath = (startAngle, endAngle, innerR, outerR) => {
    const startAngleRad = (startAngle - 90) * Math.PI / 180;
    const endAngleRad = (endAngle - 90) * Math.PI / 180;

    const x1 = centerX + innerR * Math.cos(startAngleRad);
    const y1 = centerY + innerR * Math.sin(startAngleRad);
    const x2 = centerX + outerR * Math.cos(startAngleRad);
    const y2 = centerY + outerR * Math.sin(startAngleRad);
    const x3 = centerX + outerR * Math.cos(endAngleRad);
    const y3 = centerY + outerR * Math.sin(endAngleRad);
    const x4 = centerX + innerR * Math.cos(endAngleRad);
    const y4 = centerY + innerR * Math.sin(endAngleRad);

    return `
      M ${x1} ${y1}
      L ${x2} ${y2}
      A ${outerR} ${outerR} 0 0 1 ${x3} ${y3}
      L ${x4} ${y4}
      A ${innerR} ${innerR} 0 0 0 ${x1} ${y1}
      Z
    `;
  };

  // Create four arc pieces (top-right, bottom-right, bottom-left, top-left)
  const angles = [
    { start: 0, end: 90 },      // Top-right
    { start: 90, end: 180 },    // Bottom-right
    { start: 180, end: 270 },   // Bottom-left
    { start: 270, end: 360 }    // Top-left
  ];

  angles.forEach((angle, i) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", createArcPath(angle.start, angle.end, innerRadius, outerRadius));
    path.setAttribute("class", "color-arc");
    path.setAttribute("fill", colors[i]);
    path.setAttribute("stroke", "rgba(255, 255, 255, 0.1)");
    path.setAttribute("stroke-width", "1");
    svg.appendChild(path);
  });
}

function renderColorCircle_total_average(colorData, svgSelector) {
  const svg = document.querySelector(svgSelector);
  if (!svg || !colorData || !Array.isArray(colorData.four_opposites) || colorData.four_opposites.length < 4) {
    return;
  }

  // Clear previous glyph
  // svg.querySelectorAll("*").forEach(node => node.remove());

  // Compute colors
  const arcColors = colorData.four_opposites.map(rgb =>
    `rgb(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])})`
  );

  const centerColor = colorData.overall_avg
    ? `rgb(${colorData.overall_avg.map(c => Math.round(c)).join(",")})`
    : "#333";

  // SVG dimensions
  const viewBox = svg.getAttribute("viewBox");
  const [_, __, vbWidth, vbHeight] = viewBox ? viewBox.split(/\s+/).map(Number) : [0, 0, 500, 500];
  const size = Math.min(vbWidth || 500, vbHeight || 500);

  // Define radii for larger glyph
  const outerRadius = size * 0.45; // arcs outer radius
  const innerRadius = size * 0.25; // arcs inner radius
  const centerRadius = size * 0.20; // inner circle radius

  const centerX = (vbWidth || 500) / 2;
  const centerY = (vbHeight || 500) / 2;

  // Draw inner circle (overall_avg)
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", centerX);
  circle.setAttribute("cy", centerY);
  circle.setAttribute("r", centerRadius);
  circle.setAttribute("fill", centerColor);
  svg.appendChild(circle);

  // Helper: create path for arc
  const createArcPath = (startAngle, endAngle, innerR, outerR) => {
    const startRad = (startAngle - 90) * Math.PI / 180;
    const endRad = (endAngle - 90) * Math.PI / 180;

    const x1 = centerX + innerR * Math.cos(startRad);
    const y1 = centerY + innerR * Math.sin(startRad);
    const x2 = centerX + outerR * Math.cos(startRad);
    const y2 = centerY + outerR * Math.sin(startRad);
    const x3 = centerX + outerR * Math.cos(endRad);
    const y3 = centerY + outerR * Math.sin(endRad);
    const x4 = centerX + innerR * Math.cos(endRad);
    const y4 = centerY + innerR * Math.sin(endRad);

    return `
      M ${x1} ${y1}
      L ${x2} ${y2}
      A ${outerR} ${outerR} 0 0 1 ${x3} ${y3}
      L ${x4} ${y4}
      A ${innerR} ${innerR} 0 0 0 ${x1} ${y1}
      Z
    `;
  };

  // Create four arcs
  const angles = [
    { start: 0, end: 90 },
    { start: 90, end: 180 },
    { start: 180, end: 270 },
    { start: 270, end: 360 }
  ];

  angles.forEach((angle, i) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", createArcPath(angle.start, angle.end, innerRadius, outerRadius));
    path.setAttribute("fill", arcColors[i]);
    path.setAttribute("stroke", "rgba(255,255,255,0.1)");
    path.setAttribute("stroke-width", "1");
    path.setAttribute("class", "color-arc");
    svg.appendChild(path);
  });
}


function renderDeepDiveSelection() {
      const container = document.querySelector("#deepdive-grid");
      const combined = document.querySelector("#deepdive-combined");
      const averageContainer = document.querySelector("#deepdive-average");
      const comparativeSection = document.querySelector("#deepdive-combined").closest("section"); // parent section

      if (!container) return;
      container.innerHTML = "";
      if (combined) combined.innerHTML = "";
      if (averageContainer) averageContainer.innerHTML = "";

      const oldMsg = comparativeSection.querySelector(".deepdive-placeholder-msg");
  if (oldMsg) oldMsg.remove();


  if (!state.deepDive.length) {
    // Add message **after the header**
    const msg = document.createElement("p");
    msg.className = "muted deepdive-placeholder-msg";
    msg.textContent = " - Select movies to compare the combined glyph.";

  const header = comparativeSection.querySelector("h2");
  if (header) {
    // Wrap header and message in a flex container
    const wrapper = document.createElement("div");
    wrapper.className = "comparative-header-row";

    header.replaceWith(wrapper); // remove original header
    wrapper.appendChild(header);  // put header inside wrapper
    wrapper.appendChild(msg);     // put message next to header
  }

  container.innerHTML = `<p class="muted">  (No movies selected yet. Click or drag-select dots to explore)</p>`;
  return;
}
      const picks = state.deepDive
        .map((id) => state.data.find((d) => String(d.id) === String(id)))
        .filter(Boolean)
        .map((movie) => ({
          ...movie,
          _metrics: {
            rating: parseMetric(movie.rating),

        budget: parseMetric(movie.budget),
        revenue: parseMetric(movie.revenue),
        viewership: parseMetric(movie.viewership)
      }
    }));

  if (!picks.length) {
    if (combined) {
      combined.innerHTML = `<p class="muted">Selections are unavailable with current data.</p>`;
    }
    container.innerHTML = `<p class="muted">Selections are unavailable with current data.</p>`;
    return;
  }

  if (combined) {
    renderDeepDiveCombinedGlyph(picks);
  }

  if (averageContainer) {
      renderDeepDiveAverageGlyph(picks, "#deepdive-average");
  }

function renderAverageColorGlyph() {
  if (!state.deepDive.length) return;

  const container = d3.select("#average_color_glyph");
  container.selectAll("*").remove(); // clear previous content

  const width = 500;
  const height = 500;
  const titleHeight = 0; // space for title

  const svg = container.append("svg")
    .attr("width", "100%")
    .attr("height", height)
    .attr("viewBox", `0 0 ${width * 2} ${height * 2}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("id", "average-color-circle"); // ID used by renderColorCircle

  // Title
  svg.append("text")
    .attr("class", "comparison-title")
    .attr("x", width / 2)
    .attr("y", titleHeight)
    .attr("text-anchor", "middle")
    .attr("fill", "#ffffff")
    .attr("font-size", "300px")
    .text("Dominant Colors Selection");

  // Circle under title
    const avgColorData = computeAverageColorData(state.deepDive);


    renderColorCircle_total_average(avgColorData, "#average-color-circle");

}

  if (!state.deepDive.length) {
  document.getElementById("average_color_glyph").innerHTML = "";
}

if (picks.length) {
  renderAverageColorGlyph();
}

  picks.forEach((movie) => {
    const safeId = String(movie.id);
    const card = document.createElement("div");
    card.className = "deepdive-card";
    const colorData = state.barcodeColors[movie.title];
    const avgColor = colorData && Array.isArray(colorData.overall_avg) ? colorData.overall_avg : null;
    const avgColorStyle = avgColor
      ? `background: rgb(${Math.round(avgColor[0])}, ${Math.round(avgColor[1])}, ${Math.round(avgColor[2])});`
      : "background: #2b3344;";
    const avgColorLabel = avgColor
      ? `Avg color: rgb(${Math.round(avgColor[0])}, ${Math.round(avgColor[1])}, ${Math.round(avgColor[2])})`
      : "Avg color: —";
    const ratingVal = movie._metrics.rating;
    const viewersVal = movie._metrics.viewership;
    const budgetVal = movie._metrics.budget;
    const revenueVal = movie._metrics.revenue;
    const trailerQuery = encodeURIComponent(`${movie.title} trailer`);
    const trailerUrl = `https://www.youtube.com/results?search_query=${trailerQuery}`;
    const statsLine = [
      ratingVal ? `Rating ${ratingVal.toFixed(1)}` : null,
      viewersVal ? `Viewers ${viewersVal.toLocaleString()}` : null,
      budgetVal ? `Budget $${(budgetVal / 1_000_000).toFixed(0)}M` : null,
      revenueVal ? `Revenue $${(revenueVal / 1_000_000).toFixed(0)}M` : null
    ].filter(Boolean).join(" • ");

    card.innerHTML = `
      <div class="deepdive-row">
        <!-- Column 1: Barcode -->
        <div class="deepdive-col barcode-col">
          <div id="deepdive-barcode-${safeId}" class="barcode-container-vertical"></div>
        </div>

        <!-- Column 2: Metadata -->
        <div class="deepdive-col metadata-col">
          <div class="deepdive-info">
            <div class="deepdive-title-row">
              <div class="deepdive-title">
                <h5>${movie.title}</h5>
                <a class="ghost trailer-link" href="${trailerUrl}" target="_blank" rel="noopener">Watch trailer</a>
              </div>
              <button data-id="${safeId}" class="ghost remove-btn deepdive-remove" type="button" aria-label="Remove">×</button>
            </div>
            <p class="muted movie-subtitle">${movie.release_year || "—"} • ${(movie.genres || []).join(", ") || "—"}</p>
            <div class="movie-metadata">
              <p><strong>Rating:</strong> ${ratingVal ? ratingVal.toFixed(1) : "—"}</p>
              <p><strong>Budget:</strong> ${budgetVal ? `$${(budgetVal / 1_000_000).toFixed(1)}M` : "—"}</p>
              <p><strong>Revenue:</strong> ${revenueVal ? `$${(revenueVal / 1_000_000).toFixed(1)}M` : "—"}</p>
              <p><strong>Viewership:</strong> ${viewersVal ? viewersVal.toLocaleString() : "—"}</p>
              <p><strong>Actors:</strong> ${(movie.actor_name || []).slice(0, 3).join(", ") || "—"}</p>
            </div>
          </div>
        </div>

        <!-- Column 3: Color Circle -->
        <div class="deepdive-col circle-col">
          <div class="color-circle-container">
            <svg id="deepdive-color-circle-${safeId}" class="color-circle" viewBox="0 0 120 120" width="120" height="120">
              <!-- Center circle for overall average color -->
              <circle cx="60" cy="60" r="25" fill="${avgColor ? `rgb(${Math.round(avgColor[0])}, ${Math.round(avgColor[1])}, ${Math.round(avgColor[2])})` : '#2b3344'}" />
              <!-- Four quadrant pieces will be added via JS -->
            </svg>
          </div>
        </div>
      </div>
    `;
    container.appendChild(card);

    card.addEventListener("mouseenter", () => {
      renderDeepDiveCombinedGlyph(picks, safeId);
    });
    card.addEventListener("mouseleave", () => {
      renderDeepDiveCombinedGlyph(picks, null);
    });

    if (colorData && colorData.avg_colors && colorData.avg_colors.length > 0) {
      renderBarcode(colorData.avg_colors, `#deepdive-barcode-${safeId}`);
      renderColorCircle(colorData, `#deepdive-color-circle-${safeId}`);
    } else {
      const barcodeContainer = document.querySelector(`#deepdive-barcode-${safeId}`);
      if (barcodeContainer) {
        barcodeContainer.innerHTML = '<p class="muted">Barcode not available for this movie</p>';
      }
    }
  });

  container.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      state.deepDive = state.deepDive.filter((d) => String(d) !== String(id));
      renderDeepDiveSelection();
      renderScatter(state.filtered);
    });
  });
}


function renderDeepDiveAverageGlyph(movies, containerSelector) {
  const container = d3.select(containerSelector);
  container.selectAll("*").remove();

  if (!movies.length) return;

  const avgMetrics = {
    rating: d3.mean(movies, d => d._metrics.rating) || 0,
    budget: d3.mean(movies, d => d._metrics.budget) || 0,
    revenue: d3.mean(movies, d => d._metrics.revenue) || 0,
    viewership: d3.mean(movies, d => d._metrics.viewership) || 0
  };


  const width = 500;
  const height = 500;
  const svg = container.append("svg")
    .attr("width", "100%")
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  // Title
  svg.append("text")
      .attr("class", "comparison-title")
    .attr("x", width / 2)
    .attr("y", 30)
    .attr("text-anchor", "middle")
    .attr("fill", "white")
    .attr("font-size", "30px")
    .text(`Average (${movies.length} selected)`);

  const budgetMax =  1.1 * d3.max(movies, d => d._metrics.budget);
  const revenueMax = 1.1 * d3.max(movies, d => d._metrics.revenue);
  const viewershipMax =  1.1 * d3.max(movies, d => d._metrics.viewership);

  const metrics = [
    { label: "Rating", value: avgMetrics.rating, max: 10 },
    { label: "Budget", value: avgMetrics.budget, max: budgetMax },
    { label: "Revenue", value: avgMetrics.revenue, max: revenueMax },
    { label: "Viewers", value: avgMetrics.viewership, max: viewershipMax }
  ];


  const centerX = width / 2;
  const centerY = height / 2 + 10;
  const radius = 160;
  const angleStep = (Math.PI * 2) / metrics.length;

  // Background circles
  for (let i = 1; i <= 4; i++) {
    svg.append("circle")
      .attr("cx", centerX)
      .attr("cy", centerY)
      .attr("r", (radius / 4) * i)
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,0.06)");
  }


        const tickCount = 4;
        const tickSize = 4; // length of tick mark
        function formatMetricValue(label, value) {
          switch (label) {
            case "Rating":
              return value.toFixed(1);
            case "Budget":
            case "Revenue":
              return `$${(value / 1_000_000).toFixed(0)}M`;
            case "Viewers":
              return `${(value / 1_000_000).toFixed(0)}M`;
            default:
              return value;
          }
          }
metrics.forEach((m, i) => {
  const angle = -Math.PI / 2 + i * angleStep;

  for (let t = 1; t <= tickCount; t++) {
    const r = (radius / tickCount) * t;

    // position on axis
    const x = centerX + Math.cos(angle) * r;
    const y = centerY + Math.sin(angle) * r;

    // perpendicular direction
    const perpAngle = angle + Math.PI / 2;

    svg.append("line")
      .attr("x1", x - Math.cos(perpAngle) * tickSize)
      .attr("y1", y - Math.sin(perpAngle) * tickSize)
      .attr("x2", x + Math.cos(perpAngle) * tickSize)
      .attr("y2", y + Math.sin(perpAngle) * tickSize)
      .attr("stroke", "rgba(255,255,255,0.25)")
      .attr("stroke-width", 1);
     // VALUE LABEL ONLY AT LAST TICK
    if (t === tickCount) {
        const value =(m.max / tickCount) * t; // outer ring represents max

        svg.append("text")
            .attr("x", centerX + Math.cos(angle) * (r + 12))
            .attr("y", centerY + Math.sin(angle) * (r + 12))
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .attr("fill", "var(--muted)")
            .attr("font-size", "25px")
            .text(formatMetricValue(m.label, value));
    }
  }
});

    // add metric labels and horizontal/ vertical lines
  metrics.forEach((m, i) => {
    const angle = -Math.PI / 2 + i * angleStep;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    svg.append("line")
      .attr("x1", centerX)
      .attr("y1", centerY)
      .attr("x2", x)
      .attr("y2", y)
      .attr("stroke", "rgba(255,255,255,0.1)");

    function labelOffset(label) {
      switch (label) {
        case "Revenue":
          return 20;   // move inward / lower
        case "Rating":
            return -20
        case "Viewers":
          case "Budget":
          return -25;    // move outward / higher
        default:
          return 0;
      }
    }
const y_offset = labelOffset(m.label);
const labelRadius = radius + 18;
    svg.append("text")
      .attr("x", centerX + Math.cos(angle) * labelRadius)
      .attr("y", centerY + y_offset + Math.sin(angle) * labelRadius)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", "#4ee1a0")
      .attr("font-size", "20px")
      .text(m.label);
  });

  const radial = d3.lineRadial()
  .angle((_, i) => -Math.PI / 2 + (i+1) * angleStep)
  .radius((m, i) => {
    const ratio = m.value / m.max;
    const clamped = Math.max(0.05, Math.min(ratio, 1));
    const pixelRadius = radius * clamped;

    console.log(
      m.label,
      "value:", m.value,
      "max:", m.max,
      "ratio:", ratio.toFixed(3),
      "clamped:", clamped.toFixed(3),
      "pixel radius:", pixelRadius.toFixed(2)
    );

    return pixelRadius;
  })
  .curve(d3.curveLinearClosed);

  svg.append("path")
    .datum(metrics)
    .attr("transform", `translate(${centerX},${centerY})`)
    .attr("d", radial)
    .attr("fill", "rgba(60, 180, 255, 0.2)")
    .attr("stroke", "#3cb4ff")
    .attr("stroke-width", 2);
}




function renderDeepDiveCombinedGlyph(movies, highlightId = null) {
  const container = document.querySelector("#deepdive-combined");
  if (!container) return;
  container.innerHTML = "";

  if (!movies.length) return;

  const activeIds = new Set(movies.map((m) => String(m.id)));
  state.deepDiveHidden = new Set(
    Array.from(state.deepDiveHidden).filter((id) => activeIds.has(String(id)))
  );

  const colors = d3.schemeTableau10;
  const colorFor = (idx) => colors[idx % colors.length];

  const width = 500;
  const height = 500;
  const svg = d3.select(container).append("svg")
    .attr("width", "100%")
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  // Title
  svg.append("text")
      .attr("class", "comparison-title")
    .attr("x", width / 2)
    .attr("y", 30)
    .attr("text-anchor", "middle")
    .attr("fill", "#ffffff")
    .attr("color", "white")
    .attr("font-size", "30px")
    .text("All Movies");

  const metricMax = (key, fallback, scale = 1.1) => {
    const vals = movies
      .map((m) => m._metrics ? m._metrics[key] : parseMetric(m[key]))
      .filter((v) => v > 0);
    if (!vals.length) return fallback;
    return Math.max(...vals) * scale;
  };

  const budgetMax = metricMax("budget", 400_000_000);
  const revenueMax = metricMax("revenue", 3_000_000_000);
  const viewershipMax = metricMax("viewership", 100_000_000);

  const metrics = [
    { key: "rating", label: "Rating", max: 10 },
    { key: "budget", label: "Budget", max: budgetMax },
    { key: "revenue", label: "Revenue", max: revenueMax },
    { key: "viewership", label: "Viewers", max: viewershipMax }
  ];

  const centerX = width / 2;
  const centerY = height / 2 + 10;
  const radius = 160;
  const angleStep = (Math.PI * 2) / metrics.length;

  // Background circles
  for (let i = 1; i <= 4; i++) {
    svg.append("circle")
      .attr("cx", centerX)
      .attr("cy", centerY)
      .attr("r", (radius / 4) * i)
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,0.06)");
  }


   const tickCount = 4;
        const tickSize = 4; // length of tick mark
        function formatMetricValue(label, value) {
          switch (label) {
            case "Rating":
              return value.toFixed(1);
            case "Budget":
            case "Revenue":
              return `$${(value / 1_000_000).toFixed(0)}M`;
            case "Viewers":
              return `${(value / 1_000_000).toFixed(0)}M`;
            default:
              return value;
          }
          }
    metrics.forEach((m, i) => {
      const angle = -Math.PI / 2 + i * angleStep;

      for (let t = 1; t <= tickCount; t++) {
        const r = (radius / tickCount) * t;

        // position on axis
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;

        // perpendicular direction
        const perpAngle = angle + Math.PI / 2;

        svg.append("line")
          .attr("x1", x - Math.cos(perpAngle) * tickSize)
          .attr("y1", y - Math.sin(perpAngle) * tickSize)
          .attr("x2", x + Math.cos(perpAngle) * tickSize)
          .attr("y2", y + Math.sin(perpAngle) * tickSize)
          .attr("stroke", "rgba(255,255,255,0.25)")
          .attr("stroke-width", 1);
         // VALUE LABEL ONLY AT LAST TICK
        if (t === tickCount) {
            const value =(m.max / tickCount) * t; // outer ring represents max

            svg.append("text")
                .attr("x", centerX + Math.cos(angle) * (r + 12))
                .attr("y", centerY + Math.sin(angle) * (r + 12))
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                .attr("fill", "var(--muted)")
                .attr("font-size", "25px")
                .text(formatMetricValue(m.label, value));
        }
      }
    });



  // Axes and labels
  metrics.forEach((m, i) => {
    const angle = -Math.PI / 2 + i * angleStep;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    svg.append("line")
      .attr("x1", centerX)
      .attr("y1", centerY)
      .attr("x2", x)
      .attr("y2", y)
      .attr("stroke", "rgba(255,255,255,0.1)");

        function labelOffset(label) {
      switch (label) {
        case "Revenue":
          return 20;   // move inward / lower
        case "Rating":
            return -20
        case "Viewers":
          case "Budget":
          return -25;    // move outward / higher
        default:
          return 0;
      }
    }
const y_offset = labelOffset(m.label);

    const labelRadius = radius + 18;
    svg.append("text")
      .attr("x", centerX + Math.cos(angle) * labelRadius)
      .attr("y", centerY + y_offset + Math.sin(angle) * labelRadius)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", "#b7c7e6")
      .attr("font-size", "20px")
      .text(m.label);
  });

  // Movie polygons
  movies.forEach((movie, idx) => {
    const id = String(movie.id);
    if (state.deepDiveHidden.has(id)) return;
    const isHighlighted = highlightId === id;

    const points = metrics.map((m, i) => {
      const value = movie._metrics ? movie._metrics[m.key] : parseMetric(movie[m.key]);
      const normalized = Math.min(value / m.max, 1);
      return {
        r: radius * Math.max(normalized, 0.05),
        angle: -Math.PI / 2 + i * angleStep,
      };
    });

    const coords = points.map((p) => ({
      x: centerX + Math.cos(p.angle) * p.r,
      y: centerY + Math.sin(p.angle) * p.r,
    }));

    const path = `M ${coords[0].x} ${coords[0].y} ${coords.slice(1).map((c) => `L ${c.x} ${c.y}`).join(" ")} Z`;

    svg.append("path")
      .attr("d", path)
      .attr("fill", colorFor(idx))
      .attr("fill-opacity", isHighlighted ? 0.5 : 0.15)
      .attr("stroke", colorFor(idx))
      .attr("stroke-width", isHighlighted ? 2.5 : 1.5);

    // Corner dots
    coords.forEach((coord) => {
      svg.append("circle")
        .attr("cx", coord.x)
        .attr("cy", coord.y)
        .attr("r", 3)
        .attr("fill", colorFor(idx));
    });
  });

  // Description (before legend)
  const desc = document.createElement("p");
  desc.className = "muted";
  desc.style.fontSize = "20px";
  desc.style.margin = "0.5rem 0 0.3rem 0";
  desc.textContent = "Click titles to show/hide";
  container.appendChild(desc);

  // Legend for toggling movies (below the chart)
  const legend = document.createElement("div");
  legend.className = "deepdive-legend";
  container.appendChild(legend);

  movies.forEach((movie, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const isHidden = state.deepDiveHidden.has(String(movie.id));
    btn.className = isHidden ? "" : "active";
    btn.innerHTML = `<span class="swatch" style="background:${colorFor(idx)}"></span>${movie.title}`;
    btn.addEventListener("click", () => {
      const id = String(movie.id);
      if (state.deepDiveHidden.has(id)) {
        state.deepDiveHidden.delete(id);
      } else {
        state.deepDiveHidden.add(id);
      }
      renderDeepDiveCombinedGlyph(movies);
    });
    legend.appendChild(btn);
  });
}

function renderCompare() {
  const container = document.querySelector("#compare-grid");
  if (!container) return;
  container.innerHTML = "";
  if (!state.compare.length) {
    container.innerHTML = `<p class="muted">No movies selected. Pick a title and click “Add to compare”.</p>`;
    return;
  }
  const cards = state.compare
    .map((id) => state.data.find((d) => String(d.id) === String(id)))
    .filter(Boolean)
    .slice(0, 4);
  if (!cards.length) {
    container.innerHTML = `<p class="muted">Selections are unavailable with current data.</p>`;
    return;
  }
  cards.forEach((movie) => {
    const el = document.createElement("div");
    el.className = "compare-card";
    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
        <h5>${movie.title}</h5>
        <span class="pill">${movie.release_year || "—"}</span>
      </div>
      <p><strong>Rating:</strong> ${movie.rating ?? "—"}</p>
      <p><strong>Budget:</strong> ${movie.budget ? `$${(movie.budget / 1_000_000).toFixed(1)}M` : "—"}</p>
      <p><strong>Revenue:</strong> ${movie.revenue ? `$${(movie.revenue / 1_000_000).toFixed(1)}M` : "—"}</p>
      <p><strong>Region:</strong> ${regionLabel(movie)}</p>
      <p><strong>Genres:</strong> ${(movie.genres || []).join(", ") || "—"}</p>
      <p style="margin-top:0.4rem;"><button data-id="${movie.id}" class="ghost remove-btn" style="padding:0.35rem 0.6rem;">Remove</button></p>
    `;
    container.appendChild(el);
  });
  container.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      state.compare = state.compare.filter((c) => String(c) !== String(id));
      renderCompare();
    });
  });
}

function renderTopRated() {
  const container = document.querySelector("#top-rated-list");
  if (!container) return;
  const source = state.filtered.length ? state.filtered : state.data;
  const best = source
    .filter((d) => Number.isFinite(d.rating))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 5);
  if (!best.length) {
    container.innerHTML = `<p class="muted">No rated titles for current filters.</p>`;
    return;
  }
  container.innerHTML = "";
  best.forEach((m, idx) => {
    const el = document.createElement("div");
    el.className = "compare-card";
    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
        <h5>${idx + 1}. ${m.title}</h5>
        <span class="pill">${m.release_year || "—"}</span>
      </div>
      <p><strong>Rating:</strong> ${m.rating ?? "—"} | <strong>Votes:</strong> ${m.numVotes ?? "—"}</p>
      <p><strong>Region:</strong> ${regionLabel(m)} | <strong>Genre:</strong> ${(m.genres || []).slice(0, 2).join(", ") || "—"}</p>
    `;
    container.appendChild(el);
  });
}

function renderTopRevenue() {
  const container = document.querySelector("#top-revenue-list");
  if (!container) return;
  const source = state.filtered.length ? state.filtered : state.data;
  const best = source
    .filter((d) => Number.isFinite(d.revenue) && d.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
  if (!best.length) {
    container.innerHTML = `<p class="muted">No revenue data for current filters.</p>`;
    return;
  }
  container.innerHTML = "";
  best.forEach((m, idx) => {
    const el = document.createElement("div");
    el.className = "compare-card";
    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
        <h5>${idx + 1}. ${m.title}</h5>
        <span class="pill">${m.release_year || "—"}</span>
      </div>
      <p><strong>Revenue:</strong> $${(m.revenue / 1_000_000).toFixed(1)}M</p>
      <p><strong>Rating:</strong> ${m.rating ?? "—"} | <strong>Region:</strong> ${regionLabel(m)}</p>
    `;
    container.appendChild(el);
  });
}

function renderTopBudget() {
  const container = document.querySelector("#top-budget-list");
  if (!container) return;
  const source = state.filtered.length ? state.filtered : state.data;
  const best = source
    .filter((d) => Number.isFinite(d.budget) && d.budget > 0)
    .sort((a, b) => b.budget - a.budget)
    .slice(0, 5);
  if (!best.length) {
    container.innerHTML = `<p class="muted">No budget data for current filters.</p>`;
    return;
  }
  container.innerHTML = "";
  best.forEach((m, idx) => {
    const el = document.createElement("div");
    el.className = "compare-card";
    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
        <h5>${idx + 1}. ${m.title}</h5>
        <span class="pill">${m.release_year || "—"}</span>
      </div>
      <p><strong>Budget:</strong> $${(m.budget / 1_000_000).toFixed(1)}M</p>
      <p><strong>Rating:</strong> ${m.rating ?? "—"} | <strong>Region:</strong> ${regionLabel(m)}</p>
    `;
    container.appendChild(el);
  });
}

function renderTopViewership() {
  const container = document.querySelector("#top-viewership-list");
  if (!container) return;
  const source = state.filtered.length ? state.filtered : state.data;
  const best = source
    .filter((d) => Number.isFinite(d.viewership) && d.viewership > 0)
    .sort((a, b) => b.viewership - a.viewership)
    .slice(0, 5);
  if (!best.length) {
    container.innerHTML = `<p class="muted">No viewership data for current filters.</p>`;
    return;
  }
  container.innerHTML = "";
  best.forEach((m, idx) => {
    const el = document.createElement("div");
    el.className = "compare-card";
    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
        <h5>${idx + 1}. ${m.title}</h5>
        <span class="pill">${m.release_year || "—"}</span>
      </div>
      <p><strong>Viewership:</strong> ${m.viewership.toLocaleString()}</p>
      <p><strong>Rating:</strong> ${m.rating ?? "—"} | <strong>Region:</strong> ${regionLabel(m)}</p>
    `;
    container.appendChild(el);
  });
}

async function init() {
  try {
    state.data = await loadData();
    console.log("[init] data loaded", state.data.length);
    state.barcodeColors = await loadBarcodeColors();
    console.log("[init] barcode colors loaded", Object.keys(state.barcodeColors).length);
    populateFilters(state.data);
    applyFilters();
    window.addEventListener("resize", () => render());
    if (regionFilter) regionFilter.addEventListener("change", applyFilters);
    if (genreFilter) genreFilter.addEventListener("change", applyFilters);
    searchInput.addEventListener("input", (e) => renderSearchResult(e.target.value));

    if (colorSearchBtn && colorPicker) {
      colorSearchBtn.addEventListener("click", () => {
        findMoviesByColor(colorPicker.value);
      });
    }

    console.log("[init] buttons present", {
      compareAdd: !!compareAddBtn,
      compareClear: !!compareClearBtn,
    });
    if (compareAddBtn) {
      compareAddBtn.addEventListener("click", () => {
        console.log("[compare] add clicked", state.selected?.title);
        if (!state.selected) {
          const q = (searchInput.value || "").toLowerCase().trim();
          const fallback = state.filtered.find((d) => (d.title || "").toLowerCase().includes(q));
          if (fallback) {
            state.selected = fallback;
          } else {
            return;
          }
        }
        const id = state.selected.id;
            if (!state.deepDive.includes(id)) {
              state.deepDive.push(id);
              renderDeepDiveSelection();
            }

        if (!state.deepDive.includes(id)) {
          state.deepDive.push(id);
          renderDeepDiveSelection();
        }
        if (state.compare.includes(id)) {
          render();
          return;
        }
        if (state.compare.length >= 4) {
          if (searchStatus) {
            searchStatus.textContent = "You already have 4 movies in compare. Remove one first.";
          }
          return;
        }
        state.compare.push(id);
        render();
      });
    }
    if (compareClearBtn) {
      compareClearBtn.addEventListener("click", () => {
        console.log("[compare] clear clicked");
        state.compare = [];
        render();
      });
    }
    if (deepDiveClearBtn) {
      deepDiveClearBtn.addEventListener("click", () => {
        state.deepDive = [];
        renderDeepDiveSelection();
        renderScatter(state.filtered);
      });
    }
    if (timelineResetBtn) {
      timelineResetBtn.addEventListener("click", () => {
        state.timelineSelection = { min: state.years.min, max: state.years.max };
        applyFilters();
      });
    }
    if (matrixResetBtn) {
      matrixResetBtn.addEventListener("click", () => {
        state.selectedRegions.clear();
        state.selectedGenres.clear();
        applyFilters();
      });
    }
if (selectAllBtn) {
  selectAllBtn.addEventListener("click", () => {
    const svg = d3.select("#scatter svg");
    if (svg.empty()) return;

    // 1️⃣ Grab the currently plotted circles (the same as brush does)
    const circles = svg.selectAll("circle").data();

    // 2️⃣ Update state.deepDive only for visible points
    state.deepDive = circles.map(d => d.id);
    state.deepDiveHighlights = new Set(state.deepDive.map(String));

    // 3️⃣ Update the deep dive grid panel (titles)
    renderDeepDiveSelection();

    // 4️⃣ Update only the strokes of visible circles (no re-render of scatter)
    svg.selectAll("circle")
      .attr("stroke", d => state.deepDiveHighlights.has(String(d.id))
        ? "rgba(255, 255, 255, 0.8)"
        : "rgba(255,255,255,0.15)")
      .attr("stroke-width", d => state.deepDiveHighlights.has(String(d.id)) ? 2 : 0.5);
  });
}

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (regionFilter) regionFilter.value = "";
        if (genreFilter) genreFilter.value = "";
        state.timelineSelection = { min: state.years.min, max: state.years.max };
        searchInput.value = "";
        applyFilters();
        renderSearchResult("");
      });
    }
  } catch (err) {
    console.error(err);
    const main = document.querySelector("main");
    main.innerHTML = `<p style=\"color:#fff\">${err.message}</p>`;
  }
}

init();

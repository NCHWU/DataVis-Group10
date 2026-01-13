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
const searchResult = document.querySelector("#search-result");
const searchSuggestions = document.querySelector("#search-suggestions");
const compareAddBtn = document.querySelector("#compare-add");
const compareClearBtn = document.querySelector("#compare-clear");
const deepDiveClearBtn = document.querySelector("#deepdive-clear");
const matrixResetBtn = document.querySelector("#matrix-reset");

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
      const res = await fetch(path);
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
    const matchesYear =
      (!d.release_year && d.release_year !== 0) || (d.release_year >= minYear && d.release_year <= maxYear);
    return matchesYear;
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

function regionLabel(d) {
  const reg = d.region && d.region !== "Other" && d.region !== "Unknown" ? d.region : null;
  const country = d.country && d.country !== "Unknown" ? d.country : null;
  return reg || country || "Unknown";
}

function render() {
  renderSummary(state.filtered);
  renderTimeline(baseDataForSelections());
  renderGenreRegionMatrix(state.data);
  renderScatter(state.filtered);
  renderSearchResult(searchInput.value, state.data);
  renderCompare();
  renderTopRated();
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
    overviewTitle.textContent = `Global Overview — ${region} | ${genre} | ${years}`;
  }
  const overviewSubhead = document.querySelector("#global-subhead");
  if (overviewSubhead) {
    overviewSubhead.textContent = `Snapshot for ${genre.toLowerCase()} titles in ${region} (${years})`;
  }
  const timelineTitle = document.querySelector("#timeline-title");
  if (timelineTitle) {
    timelineTitle.textContent = `Timeline — ${genre} in ${region} (${years})`;
  }
}

function renderSummary(data) {
  renderTitles();
  const container = document.querySelector("#summary-grid");
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
    .attr("fill", "#4ee1a0");

  const endLabel = labelGroup
    .append("text")
    .attr("y", margin.top - 18)
    .attr("text-anchor", "middle")
    .attr("fill", "#4ee1a0");

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

  // Style brush
  svg.selectAll(".brush .overlay")
    .style("cursor", "crosshair");

  svg.selectAll(".brush .selection")
    .attr("fill", "#4ee1a0")
    .attr("fill-opacity", 0.2)
    .attr("stroke", "#4ee1a0")
    .attr("stroke-width", 1);

  svg.selectAll(".brush .handle")
    .attr("fill", "#4ee1a0")
    .attr("stroke", "#0c0f1a")
    .attr("stroke-width", 2);

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

  const genreKey = (d) => (d.genres && d.genres.length ? d.genres[0] : "Unknown");
  const filtered = data.filter((d) => d.budget > 0 && d.rating);
  const genreValues = filtered.map((d) => genreKey(d));
  const genres = Array.from(new Set(genreValues)).sort();
  const color = d3.scaleOrdinal().domain(genres).range(d3.schemeTableau10);

  if (!genres.length) {
    container.append("div").text("No genres available for current filters.");
    return;
  }

  const hasSelection = state.scatterGenres.size > 0;
  const activeGenres = hasSelection ? new Set(state.scatterGenres) : null;

  const visible = filtered.filter((d) => {
    if (!hasSelection) return true;
    return activeGenres.has(genreKey(d));
  });

  // Downsample if very dense to keep plot readable.
  const maxPoints = 800;
  const step = Math.max(1, Math.ceil(visible.length / maxPoints));
  const plotted = visible.filter((_, i) => i % step === 0);

  // Legend
  const legend = container.append("div").attr("class", "legend scatter-legend");
  legend
    .selectAll("button")
    .data(genres, (d) => d)
    .join("button")
    .attr("type", "button")
    .attr("class", (d) => {
      if (!hasSelection) return "legend-item";
      return activeGenres.has(d) ? "legend-item active" : "legend-item inactive";
    })
    .on("click", (_, genre) => {
      if (state.scatterGenres.has(genre)) {
        state.scatterGenres.delete(genre);
      } else {
        state.scatterGenres.add(genre);
      }
      renderScatter(data);
    })
    .html((d) => `<span class="swatch" style="background:${color(d)}"></span><span>${d}</span>`);

  const width = container.node().clientWidth || 600;
  const height = container.node().clientHeight || 320;
  const legendHeight = legend.node().getBoundingClientRect().height || 0;
  const svgHeight = Math.max(260, height - legendHeight - 8);
  const margin = { top: 20, right: 20, bottom: 40, left: 55 };

  const svg = container.append("svg").attr("width", width).attr("height", svgHeight);

  const x = d3
    .scaleLinear()
    .domain([0, d3.max(plotted, (d) => d.budget) * 1.1 || 1])
    .range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, 10]).range([svgHeight - margin.bottom, margin.top]);

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${svgHeight - margin.bottom})`)
    .call(d3.axisBottom(x).tickFormat((d) => `$${(d / 1_000_000).toFixed(0)}M`));

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));

  const tooltip = container
    .append("div")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("background", "rgba(0,0,0,0.7)")
    .style("padding", "0.4rem 0.5rem")
    .style("border-radius", "8px")
    .style("color", "#fff")
    .style("font-size", "12px")
    .style("opacity", 0);

  const selectedIds = new Set(state.deepDive.map((id) => String(id)));

  svg
    .append("g")
    .selectAll("circle")
    .data(plotted)
    .join("circle")
    .attr("cx", (d) => x(d.budget))
    .attr("cy", (d) => y(d.rating))
    .attr("r", 5)
    .attr("fill", (d) => color(genreKey(d)))
    .attr("fill-opacity", 0.7)
    .style("cursor", "pointer")
    .attr("stroke", (d) => (selectedIds.has(String(d.id)) ? "#fff" : "none"))
    .attr("stroke-width", (d) => (selectedIds.has(String(d.id)) ? 1.5 : 0))
    .on("mouseenter", (event, d) => {
      tooltip
        .style("opacity", 1)
        .style("left", `${event.offsetX + 12}px`)
        .style("top", `${event.offsetY}px`)
        .html(
          `<strong>${d.title}</strong><br/>Budget: $${(d.budget / 1_000_000).toFixed(1)}M<br/>Rating: ${d.rating}`
        );
    })
    .on("click", (_, d) => {
      const id = d.id;
      const existing = state.deepDive.findIndex((m) => String(m) === String(id));
      if (existing >= 0) {
        state.deepDive.splice(existing, 1);
      } else if (state.deepDive.length < 3) {
        state.deepDive.push(id);
      } else {
        return;
      }
      renderScatter(data);
      renderDeepDiveSelection();
    })
    .on("mouseleave", () => tooltip.style("opacity", 0));

  const genreLabel = hasSelection
    ? Array.from(activeGenres).sort().join(", ")
    : "All genres";

  svg
    .append("text")
    .attr("x", margin.left)
    .attr("y", margin.top - 6)
    .text(`Budget vs. rating — ${genreLabel}`);
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
      if (regionActive && genreActive) return "#4ee1a0";
      if (regionActive || genreActive) return "rgba(78, 225, 160, 0.5)";
      return "rgba(255,255,255,0.08)";
    })
    .attr("stroke-width", (d) => {
      const regionActive = state.selectedRegions.has(d.region);
      const genreActive = state.selectedGenres.has(d.genre);
      if (regionActive && genreActive) return 2;
      if (regionActive || genreActive) return 1.2;
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
  if (!searchResult) return;
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    searchResult.innerHTML = "Select a title to see details.";
    if (searchSuggestions) searchSuggestions.innerHTML = "";
    state.selected = null;
    return;
  }
  const matches = source.filter((d) => (d.title || "").toLowerCase().includes(q)).slice(0, 6);
  if (searchSuggestions) {
    searchSuggestions.innerHTML = matches
      .map((m) => `<li data-id="${m.id}">${m.title} (${m.release_year || "—"})</li>`)
      .join("");
    searchSuggestions.querySelectorAll("li").forEach((li) => {
      li.addEventListener("click", () => {
        const id = li.getAttribute("data-id");
        const picked = source.find((d) => String(d.id) === String(id));
        if (picked) showSearchDetails(picked);
      });
    });
  }
  if (matches.length === 1) {
    showSearchDetails(matches[0]);
  } else if (matches.length > 1) {
    state.selected = matches[0];
    searchResult.innerHTML = `Multiple results for "${query}". Showing first match; pick a specific one above.`;
    showSearchDetails(matches[0]);
  } else {
    searchResult.innerHTML = `No match for "${query}".`;
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

  const colors = colorData.four_opposites.map(rgb =>
    `rgb(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])})`
  );

  // Create four arc pieces around the center circle
  // Each piece is a 90-degree arc positioned around the circle
  const centerX = 60;
  const centerY = 60;
  const innerRadius = 28; // Just outside the center circle (r=25)
  const outerRadius = 50;

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
    path.setAttribute("fill", colors[i]);
    path.setAttribute("stroke", "rgba(255, 255, 255, 0.1)");
    path.setAttribute("stroke-width", "1");
    svg.appendChild(path);
  });
}

function renderMovieGlyph(movie, containerSelector) {
  const container = d3.select(containerSelector);
  container.selectAll("*").remove();

  if (!movie.rating && !movie.budget && !movie.revenue) {
    container.append("p").attr("class", "muted").text("Metrics not available");
    return;
  }

  const width = 400;
  const height = 280;
  const svg = container.append("svg")
    .attr("width", "100%")
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  // === CIRCULAR RATING GAUGE ===
  const gaugeRadius = 50;
  const gaugeX = width / 2;
  const gaugeY = 70;

  // Background circle
  svg.append("circle")
    .attr("cx", gaugeX)
    .attr("cy", gaugeY)
    .attr("r", gaugeRadius)
    .attr("fill", "none")
    .attr("stroke", "#333")
    .attr("stroke-width", 10);

  // Rating arc (partial circle based on rating/10)
  if (movie.rating) {
    const ratingAngle = (movie.rating / 10) * 2 * Math.PI;
    const arc = d3.arc()
      .innerRadius(gaugeRadius - 5)
      .outerRadius(gaugeRadius + 5)
      .startAngle(-Math.PI / 2)  // Start at top
      .endAngle(-Math.PI / 2 + ratingAngle);

    const ratingColor = movie.rating >= 7.5 ? "#4ee1a0" :
                        movie.rating >= 6 ? "#ffd700" : "#ff6b6b";

    svg.append("path")
      .attr("transform", `translate(${gaugeX},${gaugeY})`)
      .attr("d", arc)
      .attr("fill", ratingColor);

    // Rating text
    svg.append("text")
      .attr("x", gaugeX)
      .attr("y", gaugeY)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", "28px")
      .attr("font-weight", "bold")
      .attr("fill", "#fff")
      .text(movie.rating.toFixed(1));

    // "Rating" label below number
    svg.append("text")
      .attr("x", gaugeX)
      .attr("y", gaugeY + 20)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("fill", "#aaa")
      .text("Rating");
  }

  // === HORIZONTAL BARS ===
  const barY = 150;
  const barWidth = 280;
  const barHeight = 18;
  const barX = 60;

  const metrics = [
    {
      label: "Budget",
      value: movie.budget || 0,
      max: 400_000_000,
      format: (v) => v ? `$${(v / 1_000_000).toFixed(0)}M` : "—"
    },
    {
      label: "Revenue",
      value: movie.revenue || 0,
      max: 3_000_000_000,
      format: (v) => v ? `$${(v / 1_000_000).toFixed(0)}M` : "—"
    },
    {
      label: "Votes",
      value: movie.numVotes || 0,
      max: 3_000_000,
      format: (v) => v ? `${(v / 1_000).toFixed(0)}K` : "—"
    }
  ];

  metrics.forEach((m, i) => {
    const y = barY + i * 35;
    const normalized = Math.min(m.value / m.max, 1);

    // Background bar
    svg.append("rect")
      .attr("x", barX)
      .attr("y", y)
      .attr("width", barWidth)
      .attr("height", barHeight)
      .attr("fill", "#222")
      .attr("rx", 4);

    // Filled bar (only if value > 0)
    if (normalized > 0) {
      svg.append("rect")
        .attr("x", barX)
        .attr("y", y)
        .attr("width", barWidth * normalized)
        .attr("height", barHeight)
        .attr("fill", "#4ee1a0")
        .attr("rx", 4);
    }

    // Label (left)
    svg.append("text")
      .attr("x", barX - 8)
      .attr("y", y + barHeight / 2)
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .attr("fill", "#aaa")
      .attr("font-size", "13px")
      .text(m.label);

    // Value text (right)
    svg.append("text")
      .attr("x", barX + barWidth + 8)
      .attr("y", y + barHeight / 2)
      .attr("dominant-baseline", "middle")
      .attr("fill", "#fff")
      .attr("font-size", "13px")
      .text(m.format(m.value));
  });
}

function renderDeepDiveGlyph(movie, containerSelector) {
  const container = d3.select(containerSelector);
  container.selectAll("*").remove();

  if (!movie.rating && !movie.budget && !movie.revenue && !movie.viewership) {
    container.append("p").attr("class", "muted").text("Metrics not available");
    return;
  }

  const width = 300;
  const height = 260;
  const svg = container.append("svg")
    .attr("width", "100%")
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const metrics = [
    { key: "rating", label: "Rating", value: movie.rating || 0, max: 10 },
    { key: "budget", label: "Budget", value: movie.budget || 0, max: 300_000_000 },
    { key: "revenue", label: "Revenue", value: movie.revenue || 0, max: 1_000_000_000 },
    { key: "viewership", label: "Viewers", value: movie.viewership || 0, max: 100_000_000 }
  ];

  const centerX = width / 2;
  const centerY = 120;
  const radius = 85;
  const levels = 4;
  const angleStep = (Math.PI * 2) / metrics.length;

  for (let i = 1; i <= levels; i += 1) {
    svg.append("circle")
      .attr("cx", centerX)
      .attr("cy", centerY)
      .attr("r", (radius / levels) * i)
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,0.08)");
  }

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
    svg.append("text")
      .attr("x", centerX + Math.cos(angle) * (radius + 14))
      .attr("y", centerY + Math.sin(angle) * (radius + 14))
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", "#b7c7e6")
      .attr("font-size", "11px")
      .text(m.label);
  });

  const radial = d3.lineRadial()
    .angle((d, i) => -Math.PI / 2 + i * angleStep)
    .radius((d) => (radius * Math.min(d.value / d.max, 1)))
    .curve(d3.curveLinearClosed);

  svg.append("path")
    .datum(metrics)
    .attr("transform", `translate(${centerX},${centerY})`)
    .attr("d", radial)
    .attr("fill", "rgba(78, 225, 160, 0.25)")
    .attr("stroke", "#4ee1a0")
    .attr("stroke-width", 2);

  svg.append("text")
    .attr("x", centerX)
    .attr("y", height - 12)
    .attr("text-anchor", "middle")
    .attr("fill", "#8aa0c2")
    .attr("font-size", "11px")
    .text("Rating • Budget • Revenue • Viewers");
}

function showSearchDetails(match) {
  if (!searchResult) return;
  state.selected = match;

  // Build enhanced HTML structure with barcode and glyph containers
  searchResult.innerHTML = `
    <div class="movie-detail-view">
      <div class="movie-header">
        <h3>${match.title}</h3>
        <p class="movie-meta">
          <strong>Year:</strong> ${match.release_year || "—"} |
          <strong>Region:</strong> ${regionLabel(match)}
        </p>
        <p class="movie-meta">
          <strong>Genres:</strong> ${(match.genres || []).join(", ") || "—"}
        </p>
      </div>

      <div class="barcode-section">
        <h4>Color Barcode</h4>
        <div id="barcode-canvas-container" class="barcode-container"></div>

        <div class="color-swatches">
          <span class="label">Dominant Colors:</span>
          <div id="color-swatch-container" class="swatch-grid"></div>
        </div>
      </div>

      <div class="glyph-section">
        <h4>Movie Metrics</h4>
        <div id="movie-glyph-container" class="glyph-container"></div>
      </div>

      <div class="movie-details">
        <p><strong>Rating:</strong> ${match.rating ?? "—"}</p>
        <p><strong>Budget:</strong> ${match.budget ? `$${(match.budget / 1_000_000).toFixed(1)}M` : "—"}</p>
        <p><strong>Revenue:</strong> ${match.revenue ? `$${(match.revenue / 1_000_000).toFixed(1)}M` : "—"}</p>
        <p><strong>Actors:</strong> ${(match.actor_name || []).join(", ") || "—"}</p>
        <p><strong>Viewership:</strong> ${match.viewership ? match.viewership.toLocaleString() : "—"}</p>
      </div>
    </div>
  `;

  // Render barcode if color data available
  const colorData = state.barcodeColors[match.title];
  if (colorData) {
    // Render barcode from avg_colors
    if (colorData.avg_colors && colorData.avg_colors.length > 0) {
      renderBarcode(colorData.avg_colors, '#barcode-canvas-container');
    }

    // Render 4 color swatches from four_opposites
    if (colorData.four_opposites && colorData.four_opposites.length > 0) {
      renderColorSwatches(colorData, "#color-swatch-container");
    }
  } else {
    // No barcode data available for this movie
    const barcodeContainer = document.querySelector('#barcode-canvas-container');
    if (barcodeContainer) {
      barcodeContainer.innerHTML = '<p class="muted">Barcode not available for this movie</p>';
    }
  }

  // Render glyph (always render, even if some metrics are missing)
  renderMovieGlyph(match, '#movie-glyph-container');
}

function renderDeepDiveSelection() {
  const container = document.querySelector("#deepdive-grid");
  const combined = document.querySelector("#deepdive-combined");
  if (!container) return;
  container.innerHTML = "";
  if (combined) combined.innerHTML = "";

  if (!state.deepDive.length) {
    if (combined) {
      combined.innerHTML = `<p class="muted">Select up to 3 movies to compare the combined glyph.</p>`;
    }
    container.innerHTML = `<p class="muted">No movies selected yet. Click a dot to explore.</p>`;
    return;
  }

  const picks = state.deepDive
    .map((id) => state.data.find((d) => String(d.id) === String(id)))
    .filter(Boolean)
    .slice(0, 3)
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

        <!-- Column 2: Color Circle -->
        <div class="deepdive-col circle-col">
          <div class="color-circle-container">
            <svg id="deepdive-color-circle-${safeId}" class="color-circle" viewBox="0 0 120 120" width="120" height="120">
              <!-- Center circle for overall average color -->
              <circle cx="60" cy="60" r="25" fill="${avgColor ? `rgb(${Math.round(avgColor[0])}, ${Math.round(avgColor[1])}, ${Math.round(avgColor[2])})` : '#2b3344'}" />
              <!-- Four quadrant pieces will be added via JS -->
            </svg>
          </div>
        </div>

        <!-- Column 3: Metadata -->
        <div class="deepdive-col metadata-col">
          <div class="deepdive-info">
            <div class="deepdive-title-row">
              <h5>${movie.title}</h5>
              <button data-id="${safeId}" class="ghost remove-btn" type="button">Remove</button>
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
      </div>
    `;
    container.appendChild(card);

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

function renderDeepDiveCombinedGlyph(movies) {
  const container = document.querySelector("#deepdive-combined");
  if (!container) return;
  container.innerHTML = "";


  const activeIds = new Set(movies.map((m) => String(m.id)));
  state.deepDiveHidden = new Set(
    Array.from(state.deepDiveHidden).filter((id) => activeIds.has(String(id)))
  );

  const legend = document.createElement("div");
  legend.className = "deepdive-legend";
  container.appendChild(legend);

  const colors = d3.schemeTableau10;
  const colorFor = (idx) => colors[idx % colors.length];

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

  const width = container.clientWidth || 460;
  const height = 320;
  const svg = d3.select(container).append("svg")
    .attr("width", "100%")
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const metricMax = (key, fallback, scale = 1.05) => {
    console.log(`\nCalculating max for ${key}:`);
    const vals = movies
      .map((m) => {
        const value = m._metrics ? m._metrics[key] : parseMetric(m[key]);
        console.log(`  ${m.title}: raw=${m[key]}, _metrics=${m._metrics?.[key]}, using=${value}`);
        return value;
      })
      .filter((v) => v > 0);
    console.log(`  Filtered values (>0):`, vals);
    if (!vals.length) return fallback;
    const max = Math.max(...vals) * scale;
    console.log(`  Max: ${Math.max(...vals)} * ${scale} = ${max}`);
    return max;
  };
  const budgetMax = metricMax("budget", 400_000_000, 1.1);
  const revenueMax = metricMax("revenue", 3_000_000_000, 1.1);
  const viewershipMax = metricMax("viewership", 100_000_000, 1.1);

  console.log("\n=== FINAL CALCULATED MAXES ===");
  console.log("Budget:", budgetMax, "Revenue:", revenueMax, "Viewership:", viewershipMax);

  const metrics = [
    { key: "rating", label: "Rating", max: 10 },
    { key: "budget", label: "Budget", max: budgetMax },
    { key: "revenue", label: "Revenue", max: revenueMax },
    { key: "viewership", label: "Viewers", max: viewershipMax }
  ];

  const centerX = width / 2;
  const centerY = height / 2 + 10;
  const radius = Math.min(width, height) * 0.32;
  const levels = 4;
  const angleStep = (Math.PI * 2) / metrics.length;

  for (let i = 1; i <= levels; i += 1) {
    svg.append("circle")
      .attr("cx", centerX)
      .attr("cy", centerY)
      .attr("r", (radius / levels) * i)
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,0.08)");
  }

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
    svg.append("text")
      .attr("x", centerX + Math.cos(angle) * (radius + 16))
      .attr("y", centerY + Math.sin(angle) * (radius + 16))
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", "#b7c7e6")
      .attr("font-size", "12px")
      .text(m.label);
  });

  const radial = d3.lineRadial()
    .angle((_, i) => -Math.PI / 2 + i * angleStep)
    .curve(d3.curveLinearClosed);

  movies.forEach((movie, idx) => {
    const id = String(movie.id);
    if (state.deepDiveHidden.has(id)) return;
    const values = metrics.map((m) => ({
      value: movie._metrics ? movie._metrics[m.key] : parseMetric(movie[m.key]),
      max: m.max
    }));

    const path = radial.radius((d) => {
      const normalized = Math.min(d.value / d.max, 1);
      // Use minimum 5% radius to prevent polygon collapse when values are 0
      const minRadius = 0.05;
      return radius * Math.max(normalized, minRadius);
    })(values);
    svg.append("path")
      .attr("transform", `translate(${centerX},${centerY})`)
      .attr("d", path)
      .attr("fill", colorFor(idx))
      .attr("fill-opacity", 0.18)
      .attr("stroke", colorFor(idx))
      .attr("stroke-width", 2);
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
            showSearchDetails(fallback);
          } else {
            searchResult.innerHTML = `<p class="muted">Type to search, then click a suggestion (or we’ll use the first match) before adding.</p>`;
            return;
          }
        }
        const id = state.selected.id;
        if (state.compare.includes(id)) {
          render();
          return;
        }
        if (state.compare.length >= 4) {
          searchResult.innerHTML = `<p class="muted">You already have 4 movies in compare. Remove one first.</p>`;
          return;
        }
        state.compare.push(id);
        searchResult.innerHTML = `<p class="muted">Added "${state.selected.title}" to compare below.</p>`;
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
    if (matrixResetBtn) {
      matrixResetBtn.addEventListener("click", () => {
        state.selectedRegions.clear();
        state.selectedGenres.clear();
        applyFilters();
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

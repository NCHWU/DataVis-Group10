const state = {
  data: [],
  filtered: [],
  years: { min: 1900, max: 2030 },
  compare: [],
  selected: null,
};

const regionFilter = document.querySelector("#region-filter");
const genreFilter = document.querySelector("#genre-filter");
const yearMinInput = document.querySelector("#year-min");
const yearMaxInput = document.querySelector("#year-max");
const resetBtn = document.querySelector("#reset-filters");
const searchInput = document.querySelector("#search-title");
const searchResult = document.querySelector("#search-result");
const searchSuggestions = document.querySelector("#search-suggestions");
const compareAddBtn = document.querySelector("#compare-add");
const compareClearBtn = document.querySelector("#compare-clear");

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

function populateFilters(data) {
  const regions = Array.from(new Set(data.map((d) => regionLabel(d)))).filter(Boolean).sort();
  regionFilter.innerHTML =
    `<option value=\"\">All regions</option>` + regions.map((r) => `<option value=\"${r}\">${r}</option>`).join("");

  const genres = Array.from(new Set(data.flatMap((d) => d.genres || []))).sort();
  genreFilter.innerHTML = `<option value=\"\">All genres</option>` +
    genres.map((g) => `<option value=\"${g}\">${g}</option>`).join("");

  const years = data.map((d) => d.release_year).filter((y) => Number.isFinite(y));
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  state.years = { min: minYear, max: maxYear };
  setYearOptions(yearMinInput, minYear, maxYear, minYear);
  setYearOptions(yearMaxInput, minYear, maxYear, maxYear);
}

function applyFilters() {
  const region = regionFilter.value;
  const genre = genreFilter.value;
  const minYear = Number(yearMinInput.value) || state.years.min;
  const maxYear = Number(yearMaxInput.value) || state.years.max;

  state.filtered = state.data.filter((d) => {
    const matchesRegion = !region || regionLabel(d) === region;
    const matchesGenre = !genre || (d.genres || []).includes(genre);
    const matchesYear =
      (!d.release_year && d.release_year !== 0) || (d.release_year >= minYear && d.release_year <= maxYear);
    return matchesRegion && matchesGenre && matchesYear;
  });
  render();
}

function regionLabel(d) {
  const reg = d.region && d.region !== "Other" && d.region !== "Unknown" ? d.region : null;
  const country = d.country && d.country !== "Unknown" ? d.country : null;
  return reg || country || "Unknown";
}

function render() {
  renderSummary(state.filtered);
  renderTimeline(state.filtered);
  renderScatter(state.filtered);
  renderSearchResult(searchInput.value, state.filtered);
  renderCompare();
  renderTopRated();
}

function setYearOptions(selectEl, minYear, maxYear, selectedValue) {
  if (!selectEl) return;
  const options = [];
  if (selectEl.id === "year-min") {
    for (let y = minYear; y <= maxYear; y += 1) {
      options.push(`<option value="${y}">${y}</option>`);
    }
  } else {
    for (let y = maxYear; y >= minYear; y -= 1) {
      options.push(`<option value="${y}">${y}</option>`);
    }
  }
  selectEl.innerHTML = options.join("");
  selectEl.value = selectedValue;
}

function currentRegionLabel() {
  return regionFilter.value || "All regions";
}

function currentGenreLabel() {
  return genreFilter.value || "All genres";
}

function currentYearRangeLabel() {
  const minYear = Number(yearMinInput.value) || state.years.min;
  const maxYear = Number(yearMaxInput.value) || state.years.max;
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

  const genreLabel = genreFilter.value ? `${genreFilter.value}` : "All genres";

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

  const width = container.node().clientWidth || 600;
  const height = container.node().clientHeight || 320;
  const margin = { top: 20, right: 50, bottom: 30, left: 50 };

  const svg = container.append("svg").attr("width", width).attr("height", height);
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

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
    .attr("y", margin.top - 6)
    .text(`Budget (left) • Rating (right) — ${genreLabel}`);

  // Legend
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`)
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
  svg
    .append("rect")
    .attr("fill", "transparent")
    .attr("pointer-events", "all")
    .attr("x", margin.left)
    .attr("y", margin.top)
    .attr("width", innerWidth)
    .attr("height", innerHeight)
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
  const regions = Array.from(new Set(filtered.map((d) => d.region || "Unknown")));
  const color = d3.scaleOrdinal().domain(regions).range(d3.schemeTableau10);

  // Downsample if very dense to keep plot readable.
  const maxPoints = 800;
  const step = Math.max(1, Math.ceil(filtered.length / maxPoints));
  const plotted = filtered.filter((_, i) => i % step === 0);

  // Legend
  container
    .append("div")
    .attr("class", "legend scatter-legend")
    .html(
      regions
        .map((r) => `<span class="swatch" style="background:${color(r)}"></span>${r}`)
        .join("")
    );

  const width = container.node().clientWidth || 600;
  const height = container.node().clientHeight || 320;
  const margin = { top: 20, right: 20, bottom: 40, left: 55 };

  const svg = container.append("svg").attr("width", width).attr("height", height);

  const x = d3
    .scaleLinear()
    .domain([0, d3.max(plotted, (d) => d.budget) * 1.1 || 1])
    .range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, 10]).range([height - margin.bottom, margin.top]);

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
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

  svg
    .append("g")
    .selectAll("circle")
    .data(plotted)
    .join("circle")
    .attr("cx", (d) => x(d.budget))
    .attr("cy", (d) => y(d.rating))
    .attr("r", 5)
    .attr("fill", (d) => color(d.region))
    .attr("fill-opacity", 0.7)
    .on("mouseenter", (event, d) => {
      tooltip
        .style("opacity", 1)
        .style("left", `${event.offsetX + 12}px`)
        .style("top", `${event.offsetY}px`)
        .html(
          `<strong>${d.title}</strong><br/>Budget: $${(d.budget / 1_000_000).toFixed(1)}M<br/>Rating: ${d.rating}`
        );
    })
    .on("mouseleave", () => tooltip.style("opacity", 0));

  svg
    .append("text")
    .attr("x", margin.left)
    .attr("y", margin.top - 6)
    .text(`Budget vs. rating — ${genreFilter.value || "All genres"}`);
}

function renderSearchResult(query, data = state.filtered) {
  const source = data && data.length ? data : state.data;
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

function showSearchDetails(match) {
  if (!searchResult) return;
  state.selected = match;
  searchResult.innerHTML = `
    <h3>${match.title}</h3>
    <p><strong>Year:</strong> ${match.release_year || "—"} | <strong>Region:</strong> ${regionLabel(match)}</p>
    <p><strong>Genres:</strong> ${(match.genres || []).join(", ") || "—"}</p>
    <p><strong>Rating:</strong> ${match.rating ?? "—"} | <strong>Budget:</strong> ${
    match.budget ? `$${(match.budget / 1_000_000).toFixed(1)}M` : "—"
  } | <strong>Revenue:</strong> ${match.revenue ? `$${(match.revenue / 1_000_000).toFixed(1)}M` : "—"}</p>
    <p><strong>Actors:</strong> ${(match.actor_name || []).join(", ") || "—"}</p>
    <p><strong>Viewership:</strong> ${match.viewership ? match.viewership.toLocaleString() : "—"}</p>
  `;
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
    populateFilters(state.data);
    applyFilters();
    window.addEventListener("resize", () => render());
    regionFilter.addEventListener("change", applyFilters);
    genreFilter.addEventListener("change", applyFilters);
    yearMinInput.addEventListener("change", applyFilters);
    yearMaxInput.addEventListener("change", applyFilters);
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
    resetBtn.addEventListener("click", () => {
      regionFilter.value = "";
      genreFilter.value = "";
      yearMinInput.value = state.years.min;
      yearMaxInput.value = state.years.max;
      searchInput.value = "";
      applyFilters();
      renderSearchResult("");
    });
  } catch (err) {
    console.error(err);
    const main = document.querySelector("main");
    main.innerHTML = `<p style=\"color:#fff\">${err.message}</p>`;
  }
}

init();

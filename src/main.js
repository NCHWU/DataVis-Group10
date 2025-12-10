const state = {
  data: [],
  filtered: [],
  years: { min: 1900, max: 2030 },
};

const regionFilter = document.querySelector("#region-filter");
const genreFilter = document.querySelector("#genre-filter");
const yearMinInput = document.querySelector("#year-min");
const yearMaxInput = document.querySelector("#year-max");
const resetBtn = document.querySelector("#reset-filters");
const searchInput = document.querySelector("#search-title");
const searchResult = document.querySelector("#search-result");
const searchSuggestions = document.querySelector("#search-suggestions");

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
  renderSearchResult(searchInput.value);
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

function renderSummary(data) {
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
}

function renderScatter(data) {
  const container = d3.select("#scatter");
  container.selectAll("*").remove();
  if (!data.length) {
    container.append("div").text("No data for current filters.");
    return;
  }

  const filtered = data.filter((d) => d.budget > 0 && d.rating);
  const width = container.node().clientWidth || 600;
  const height = container.node().clientHeight || 320;
  const margin = { top: 20, right: 20, bottom: 40, left: 55 };

  const svg = container.append("svg").attr("width", width).attr("height", height);

  const x = d3
    .scaleLinear()
    .domain([0, d3.max(filtered, (d) => d.budget) * 1.1 || 1])
    .range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, 10]).range([height - margin.bottom, margin.top]);
  const color = d3.scaleOrdinal().domain(Array.from(new Set(filtered.map((d) => d.region)))).range(d3.schemeTableau10);

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
    .data(filtered)
    .join("circle")
    .attr("cx", (d) => x(d.budget))
    .attr("cy", (d) => y(d.rating))
    .attr("r", 6)
    .attr("fill", (d) => color(d.region))
    .attr("fill-opacity", 0.8)
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

function renderSearchResult(query) {
  if (!searchResult) return;
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    searchResult.innerHTML = "Select a title to see details.";
    if (searchSuggestions) searchSuggestions.innerHTML = "";
    return;
  }
  const matches = state.data.filter((d) => (d.title || "").toLowerCase().includes(q)).slice(0, 6);
  if (searchSuggestions) {
    searchSuggestions.innerHTML = matches
      .map((m) => `<li data-id="${m.id}">${m.title} (${m.release_year || "—"})</li>`)
      .join("");
    searchSuggestions.querySelectorAll("li").forEach((li) => {
      li.addEventListener("click", () => {
        const id = li.getAttribute("data-id");
        const picked = state.data.find((d) => String(d.id) === String(id));
        if (picked) showSearchDetails(picked);
      });
    });
  }
  if (matches.length === 1) {
    showSearchDetails(matches[0]);
  } else if (matches.length > 1) {
    searchResult.innerHTML = `Multiple results for "${query}". Pick one above.`;
  } else {
    searchResult.innerHTML = `No match for "${query}".`;
  }
}

function showSearchDetails(match) {
  if (!searchResult) return;
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

async function init() {
  try {
    state.data = await loadData();
    populateFilters(state.data);
    applyFilters();
    window.addEventListener("resize", () => render());
    regionFilter.addEventListener("change", applyFilters);
    genreFilter.addEventListener("change", applyFilters);
    yearMinInput.addEventListener("change", applyFilters);
    yearMaxInput.addEventListener("change", applyFilters);
    searchInput.addEventListener("input", (e) => renderSearchResult(e.target.value));
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

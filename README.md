MovieMaker Analytics Dashboard
==============================

Goal
----
Build a static, GitHub Pages–friendly dashboard that explores Netflix/IMDB/Kaggle data: global overview, timeline trends, and deep-dive scatter/radar comparisons.

Features
--------
- Timeline chart showing budget and rating trends over time with brush selection
- Genre × Region color matrix heatmap with clickable filtering
- Budget vs Rating scatter plot with zoom, pan, and multi-select
- Deep dive panel with movie barcodes, radar charts, and metric comparisons
- Top performers lists (rating, revenue, budget, viewership)
- Search with autocomplete to find and compare specific movies

Architecture
------------
Raw CSV/TSV data (IMDB, Netflix, Kaggle) → `scripts/prepare_data.py` merges on imdb_id → `public/data/processed.json`.
Frontend loads JSON via Fetch API → D3.js renders interactive visualizations.
User interactions update global state → all charts re-render reactively.
Barcode colors extracted from trailers via `barcode generation/` scripts → `public/data/movies_colors.json`.
No build step; static files served directly via GitHub Pages.

Data Schema (processed.json)
----------------------------
| Field | Type | Description |
|-------|------|-------------|
| id | string | IMDB ID (e.g., tt1234567) |
| title | string | Movie title |
| release_year | int | Year of release |
| region | string | Continent (North America, Europe, Asia, etc.) |
| genres | array | List of genres |
| budget | float | Production budget in USD |
| revenue | float | Box office revenue in USD |
| imdb_rating | float | IMDB score (0-10) |
| imdb_votes | int | Number of IMDB votes |
| viewership | float | Netflix hours viewed / duration |
| top_actors | array | Top 3 cast members |

Getting Started
---------------
- Prereqs: Python 3.10+, Node optional (not required for static hosting), `pip install -r requirements.txt` if you want to run the data prep script.
- Data: Download the three sources listed in `data/schema.md`, place raw CSV/TSV files in `data/raw`, then run the prep script to emit `public/data/processed.json`.

Project Layout
--------------
- `data/` – raw data goes in `data/raw`; schema notes live in `data/schema.md`.
- `scripts/prepare_data.py` – merges Kaggle/IMDB/Netflix engagement datasets into a tidy file for the frontend.
- `public/` – static assets served by GitHub Pages; processed data lands in `public/data/`.
- `src/` – vanilla JS dashboard shell; no build step required.
- `index.html` – entry page that wires the JS modules and D3 from a CDN.

Usage
-----
1) Fetch data (see `data/schema.md`) into `data/raw/`.
2) Run `python scripts/prepare_data.py` to generate `public/data/processed.json` and `public/data/sample_processed.json`.
3) run the command: python -m http.server 8000 and view the dashboard on: http://localhost:8000/index.html

Notes
-----
- All dependencies for the page are loaded via CDN; the repo stays static-site–friendly.
- The frontend code already loads `public/data/sample_processed.json` so you can see placeholder charts without real data.
- AI  tools like codex, claude, ChatGPT were used for code formatting, comments formatting, evaluating and formatting documentation. It has been used as assistant to help implementing elements of the dashboard, and connecting it to the backend.

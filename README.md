MovieMaker Analytics Dashboard
==============================

Goal
----
Build a static, GitHub Pages–friendly dashboard that explores Netflix/IMDB/Kaggle data: global overview, timeline trends, and deep-dive scatter/radar comparisons.

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

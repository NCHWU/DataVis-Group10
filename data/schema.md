Data Sources
------------
- Netflix Engagement Report (Kaggle, `netflix-engagement-report`(https://www.kaggle.com/datasets/konradb/netflix-engagement-report)) → viewership (hours viewed, duration), title, country.
- Movies Budget/Revenue (Kaggle `movies-dataset`(https://www.kaggle.com/datasets/utkarshx27/movies-dataset) ) → `id`, `title`, `budget`, `revenue`.
- IMDB Non-Commercial Datasets (https://developer.imdb.com/non-commercial-datasets/) → `title.basics.tsv` (title, year, runtime, genres, region/language codes), `title.ratings.tsv` (averageRating, numVotes), `title.principals.tsv` (cast/crew), `name.basics.tsv` (actor ratings via `averageRating`/`numVotes` if available in supplemental data).

Expected Raw File Locations
---------------------------
Place the following in `data/raw/`:
- `engagement.csv` (Netflix engagement report)
- `movies.csv` (Kaggle movies dataset)
- `title.basics.tsv.gz`, `title.ratings.tsv.gz`, `title.principals.tsv.gz`, `name.basics.tsv.gz` (IMDB)

Working Keys
------------
- Primary key: `title` + `release_year` is the fallback join if IMDB `tconst` is missing from Kaggle files.
- Secondary key: `imdb_id` / `tconst` when available.

Derived Fields (produced by `prepare_data.py`)
----------------------------------------------
- `viewership` = `hours_viewed` / `duration_hours` (or minutes normalized).
- `country` and `language` pulled from IMDB; multi-valued genres split into arrays.
- `actor_rating` = mean of lead actors’ `averageRating` (from IMDB ratings where available).
- `success_metrics` = `rating`, `revenue`, `budget`, `viewership`.
- `region` = continent lookup from country code (fallback to country).

Outputs
-------
- `public/data/processed.json` – full merged records.
- `public/data/sample_processed.json` – small subset for frontend smoke tests.

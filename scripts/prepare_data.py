"""
Prepare merged movie data for the dashboard.

Inputs (expected in data/raw/):
- engagement.csv: Netflix engagement report with columns like
  title, hours_viewed, duration_minutes, country.
- movies.csv: Kaggle movies dataset with id, title, budget, revenue,
  release_date or release_year, imdb_id (optional).
- title.basics.tsv.gz, title.ratings.tsv.gz, title.principals.tsv.gz,
  name.basics.tsv.gz: IMDB non-commercial data exports.

Outputs:
- public/data/processed.json
- public/data/sample_processed.json
"""
from __future__ import annotations

import json
import numpy as np
from pathlib import Path
from typing import Iterable, List, Optional

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
PUBLIC_DATA = ROOT / "public" / "data"


def _ensure_paths() -> None:
    PUBLIC_DATA.mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)


def _read_csv(name: str, **kwargs) -> pd.DataFrame:
    path = RAW_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"Missing raw file: {path}")
    return pd.read_csv(path, **kwargs)


def _read_tsv(name: str, usecols: Optional[List[str]] = None) -> pd.DataFrame:
    primary = RAW_DIR / name
    fallback = RAW_DIR / name.replace(".tsv.gz", ".tsv")
    path = primary if primary.exists() else fallback
    if not path.exists():
        raise FileNotFoundError(f"Missing raw file: {primary} (or {fallback})")
    return pd.read_csv(path, sep="\t", compression="infer", na_values="\\N", usecols=usecols)


def load_movies() -> pd.DataFrame:
    df = _read_csv("movies.csv")
    df.columns = [c.lower() for c in df.columns]
    if "release_year" not in df.columns and "release_date" in df.columns:
        df["release_year"] = pd.to_datetime(df["release_date"], errors="coerce").dt.year
    df["release_year"] = df["release_year"].astype("Int64")
    keep = [
        "id",
        "imdb_id",
        "title",
        "budget",
        "revenue",
        "release_year",
    ]
    for col in keep:
        if col not in df.columns:
            df[col] = pd.NA
    return df[keep]


def load_engagement() -> pd.DataFrame:
    df = _read_csv("engagement.csv")
    df.columns = [c.lower() for c in df.columns]
    # Normalize naming differences. Some releases omit duration; fall back to hours only.
    duration_cols = [c for c in df.columns if "duration" in c]
    hours_cols = [c for c in df.columns if "hours" in c and "viewed" in c]
    hours_col = hours_cols[0] if hours_cols else None
    duration_col = duration_cols[0] if duration_cols else None
    if hours_col is None:
        raise ValueError("engagement.csv must include an hours viewed column")
    df["hours_viewed"] = pd.to_numeric(df[hours_col], errors="coerce")
    df["duration_minutes"] = pd.to_numeric(df[duration_col], errors="coerce") if duration_col else pd.NA
    if duration_col:
        df["viewership"] = df["hours_viewed"] / (df["duration_minutes"] / 60.0)
    else:
        df["viewership"] = df["hours_viewed"]
    # Country is not present in some releases; leave as Unknown until enriched.
    keep = ["title", "country", "duration_minutes", "hours_viewed", "viewership"]
    for col in keep:
        if col not in df.columns:
            df[col] = pd.NA
    return df[keep]


def _normalize_title(s: pd.Series) -> pd.Series:
    return s.fillna("").str.lower().str.strip()


def load_imdb(candidate_titles: set[str]) -> pd.DataFrame:
    basics_path = RAW_DIR / "title.basics.tsv.gz"
    if not basics_path.exists():
        basics_path = RAW_DIR / "title.basics.tsv"
    if not basics_path.exists():
        raise FileNotFoundError(f"Missing raw file: {basics_path}")

    basics_chunks = []
    for chunk in pd.read_csv(
        basics_path,
        sep="\t",
        na_values="\\N",
        usecols=["tconst", "titleType", "primaryTitle", "originalTitle", "startYear", "runtimeMinutes", "genres"],
        compression="infer",
        chunksize=500_000,
    ):
        chunk = chunk[chunk["titleType"].isin(["movie", "tvSeries", "tvMiniSeries"])]
        chunk["release_year"] = pd.to_numeric(chunk["startYear"], errors="coerce").astype("Int64")
        chunk = chunk[(chunk["release_year"].isna()) | (chunk["release_year"] >= 1990)]
        chunk["title"] = chunk["primaryTitle"].fillna(chunk["originalTitle"])
        norm_primary = _normalize_title(chunk["primaryTitle"])
        norm_original = _normalize_title(chunk["originalTitle"])
        mask = norm_primary.isin(candidate_titles) | norm_original.isin(candidate_titles)
        chunk = chunk[mask]
        chunk["genres"] = chunk["genres"].fillna("").apply(lambda g: [x for x in g.split(",") if x])
        chunk.rename(columns={"runtimeMinutes": "duration_minutes"}, inplace=True)
        basics_chunks.append(chunk[["tconst", "title", "release_year", "duration_minutes", "genres"]])

    basics = pd.concat(basics_chunks, ignore_index=True) if basics_chunks else pd.DataFrame(
        columns=["tconst", "title", "release_year", "duration_minutes", "genres"]
    )

    ratings_path = RAW_DIR / "title.ratings.tsv.gz"
    if not ratings_path.exists():
        ratings_path = RAW_DIR / "title.ratings.tsv"
    if not ratings_path.exists():
        raise FileNotFoundError(f"Missing raw file: {ratings_path}")

    rating_chunks = []
    for chunk in pd.read_csv(
        ratings_path,
        sep="\t",
        na_values="\\N",
        usecols=["tconst", "averageRating", "numVotes"],
        compression="infer",
        chunksize=500_000,
    ):
        chunk = chunk[chunk["tconst"].isin(basics["tconst"])]
        rating_chunks.append(chunk)
    ratings = pd.concat(rating_chunks, ignore_index=True) if rating_chunks else pd.DataFrame(
        columns=["tconst", "averageRating", "numVotes"]
    )
    ratings.rename(columns={"averageRating": "rating"}, inplace=True)

    imdb = basics.merge(ratings, on="tconst", how="left")
    return imdb[["tconst", "title", "release_year", "duration_minutes", "genres", "rating", "numVotes"]]


def load_cast_ratings(valid_tconsts: Iterable[str]) -> pd.DataFrame:
    valid = set(valid_tconsts)
    collected = []
    principals_path = RAW_DIR / "title.principals.tsv"
    if not principals_path.exists():
        principals_path = RAW_DIR / "title.principals.tsv.gz"
    if not principals_path.exists():
        raise FileNotFoundError(f"Missing raw file: {principals_path}")

    for chunk in pd.read_csv(
        principals_path,
        sep="\t",
        na_values="\\N",
        usecols=["tconst", "nconst", "category", "ordering"],
        chunksize=200_000,
        compression="infer",
    ):
        chunk = chunk[chunk["tconst"].isin(valid)]
        chunk = chunk[chunk["category"].isin(["actor", "actress"]) & (chunk["ordering"] <= 3)]
        collected.append(chunk[["tconst", "nconst"]])
    principals = pd.concat(collected, ignore_index=True) if collected else pd.DataFrame(columns=["tconst", "nconst"])

    if principals.empty:
        return pd.DataFrame(columns=["tconst", "actor_name"])

    needed_nconst = set(principals["nconst"].dropna().unique().tolist())
    names_path = RAW_DIR / "name.basics.tsv.gz"
    if not names_path.exists():
        names_path = RAW_DIR / "name.basics.tsv"
    if not names_path.exists():
        raise FileNotFoundError(f"Missing raw file: {names_path}")

    name_chunks = []
    for chunk in pd.read_csv(
        names_path,
        sep="\t",
        na_values="\\N",
        usecols=["nconst", "primaryName"],
        chunksize=200_000,
        compression="infer",
    ):
        chunk = chunk[chunk["nconst"].isin(needed_nconst)]
        name_chunks.append(chunk)
    names = pd.concat(name_chunks, ignore_index=True) if name_chunks else pd.DataFrame(columns=["nconst", "primaryName"])
    names.rename(columns={"primaryName": "actor_name"}, inplace=True)
    cast = principals.merge(names, on="nconst", how="left")
    grouped = cast.groupby("tconst")["actor_name"].apply(lambda s: [n for n in s.dropna().tolist()])
    return grouped.reset_index()


def merge_data() -> pd.DataFrame:
    movies = load_movies()
    engagement = load_engagement()
    candidate_titles = set(_normalize_title(movies["title"]).dropna().tolist()) | set(
        _normalize_title(engagement["title"]).dropna().tolist()
    )
    imdb = load_imdb(candidate_titles)
    cast = load_cast_ratings(imdb["tconst"])
    imdb = imdb.merge(cast, on="tconst", how="left")

    # Join Kaggle movies to IMDB on imdb_id when present.
    merged_by_id = movies.merge(imdb, left_on="imdb_id", right_on="tconst", how="left", suffixes=("", "_imdb"))
    fallback = movies.merge(imdb, on=["title", "release_year"], how="left", suffixes=("", "_imdb"))
    merged = merged_by_id.combine_first(fallback)

    # Add engagement (title/country level).
    merged = merged.merge(engagement, on="title", how="left", suffixes=("", "_engagement"))

    # Clean up.
    merged["duration_minutes"] = merged["duration_minutes"].fillna(merged["duration_minutes_engagement"])
    merged["viewership"] = merged["viewership"].fillna(merged["hours_viewed"])
    merged["genres"] = merged["genres"].apply(lambda g: g if isinstance(g, list) else [])
    merged["country"] = merged["country"].fillna("Unknown")
    merged["language"] = pd.NA  # Placeholder; enrich if language data is added.
    merged["actor_rating"] = pd.NA  # Placeholder for future enrichment.
    merged["region"] = merged["country"].apply(_to_region)
    merged["id"] = merged["id"].fillna(merged["tconst"])
    return merged[
        [
            "id",
            "title",
            "release_year",
            "region",
            "country",
            "language",
            "genres",
            "duration_minutes",
            "budget",
            "revenue",
            "rating",
            "numVotes",
            "viewership",
            "actor_rating",
            "actor_name",
        ]
    ]


def _to_region(country: str) -> str:
    if not isinstance(country, str):
        return "Unknown"
    country_upper = country.upper()
    if country_upper in {"US", "USA", "CANADA", "MEXICO"}:
        return "North America"
    if country_upper in {"UK", "UNITED KINGDOM", "FRANCE", "GERMANY", "SPAIN", "ITALY", "NETHERLANDS"}:
        return "Europe"
    if country_upper in {"INDIA", "CHINA", "JAPAN", "KOREA", "SOUTH KOREA"}:
        return "Asia"
    if country_upper in {"BRAZIL", "ARGENTINA", "CHILE"}:
        return "South America"
    if country_upper in {"AUSTRALIA", "NEW ZEALAND"}:
        return "Oceania"
    if country_upper in {"SOUTH AFRICA", "NIGERIA", "KENYA"}:
        return "Africa"
    return "Other"


def _export_json(df: pd.DataFrame, path: Path, sample: bool = False) -> None:
    cleaned = df.replace([np.inf, -np.inf], np.nan)
    # Use pandas JSON export to coerce NaN -> null safely.
    records = json.loads(cleaned.to_json(orient="records"))
    with path.open("w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, allow_nan=False)
    print(f"Wrote {len(records)} rows to {path}")
    if sample:
        print("Sample contents:", records[:2])


def main() -> None:
    _ensure_paths()
    merged = merge_data()
    _export_json(merged, PUBLIC_DATA / "processed.json")
    _export_json(merged.sample(min(50, len(merged))), PUBLIC_DATA / "sample_processed.json")


if __name__ == "__main__":
    main()

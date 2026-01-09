import yt_dlp


def find_trailer(movie_title):
    query = f"ytsearch1:{movie_title} official trailer"  # '1' = return 1 result
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': False,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            result = ydl.extract_info(query, download=False)
            if 'entries' in result and result['entries']:
                video = result['entries'][0]
                return video['webpage_url']
    except:
        return None
    return None

if __name__ == "__main__":
    movie = "Inception"
    url = find_trailer(movie)
    print("Trailer URL:", url)

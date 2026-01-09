import subprocess
import cv2  # pip install opencv-python
import numpy as np
import os
from url_finder import find_trailer
import time
import re
from encoder import pick_most_different_colors, get_barcode_png, pick_most_dominant_colors, show_four_colours
import json
import os
import pandas as pd


JSON_FLUSH_INTERVAL = 50
json_buffer = []
save_file = "results_nieuw"

def download_video(url, out_path="video.mp4", retries=5, delay=3):
    """
    Downloads a YouTube video using yt-dlp with retries.
    Retries the exact same format if it fails.
    """
    cmd = [
        "yt-dlp",
        "-f", "bestvideo[ext=mp4][vcodec^=avc1][height<=144]",
        "--no-audio",
        "--merge-output-format", "mp4",
        "-o", out_path,
        url
    ]

    for attempt in range(1, retries + 1):
        try:
            subprocess.run(cmd, check=True,
                           stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL)
            return out_path  # success
        except subprocess.CalledProcessError:
            print(f"Attempt {attempt} failed. Retrying..." if attempt < retries else
                  f"Attempt {attempt} failed. No more retries.")
            if attempt < retries:
                time.sleep(delay)  # wait a bit before retrying

    # All retries failed
    return None


def is_title_screen(frame):
    h, w = frame.shape[:2]
    sw = 30      # side strip width
    vm = 20      # vertical margin to skip black bars

    sides = np.concatenate([
        frame[vm:h-vm, :sw],          # left strip
        frame[vm:h-vm, w-sw:]          # right strip
    ])
    # print(sides)

    sides_std = sides.std() / 255  # normalize to [0,1]
    return not sides_std < 0.25  # adjust threshold empirically

def downsample_uniformly(lst, max_size=200):

    n = len(lst)
    print(f"size before downsizing: {n}")
    if n <= max_size:
        return lst
    # compute indices to keep
    indices = np.linspace(0, n-1, max_size, dtype=int)
    new_list = [lst[i] for i in indices]
    print(f"size after downsizing: {len(new_list)}")
    return new_list


def remove_start(colors):
    colors = colors[2::]
    print(colors[0], colors[1])
    i = 0
    while i < len(colors) - 1 and np.linalg.norm(colors[i] - colors[i + 1]) < 0.5:
        colors[i], colors[i + 1]
        i += 1
    colors_start_removed = colors[i+1:]

    return colors_start_removed
    
def video_to_color_barcode(video_path, output="barcode.png", max_uniform_ratio = 0.5, sample_rate=5):
    cap = cv2.VideoCapture(video_path)
    # cap.set(cv2.CAP_PROP_FRAME_WIDTH, 160)
    # cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 90)

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frames_to_save = 300

    frames_per_capture = int(total_frames / frames_to_save)
    # print(f"total frames: {total_frames}")
    # print(f"frames per capture{frames_per_capture}")


    avg_colors = []

    for idx in range(frames_to_save):
        for _ in range(frames_per_capture - 1):
            if not cap.grab():
                break

        ret, frame = cap.read()
        if not ret:
            break

        if not is_title_screen(frame):
            avg_colors.append(frame.mean(axis=(0, 1))[::-1])     #saves in RGB


    cap.release()
    
    avg_colors = remove_start(avg_colors)
    
    start_downsample = time.time()
    avg_colors = downsample_uniformly(avg_colors, 200)
    end_downsample = time.time()
    print("Time to downsample:", end_downsample - start_downsample)


    start_avg = time.time()
    overall_avg = np.mean(np.stack(avg_colors), axis=0)
    end_avg = time.time()
    print("Time to calculate average:", end_avg - start_avg)


    start_dom = time.time()
    four_dominant = pick_most_dominant_colors(avg_colors)
    # show_four_colours(four_dominant, 'dominant 4')
    end_dom = time.time()
    print("Time to pick dominant colors:", end_dom - start_dom)

    return avg_colors, overall_avg, four_dominant



def safe_filename(name):
    # replace any invalid character with underscore
    return re.sub(r'[<>:"/\\|?*]', '_', name)

def flush_json_buffer(json_path, buffer, existing_data):
    if not buffer:
        return existing_data

    existing_data.extend(buffer)
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(existing_data, f, indent=4)

    buffer.clear()
    print("Flushed JSON to disk")
    return existing_data


#skip movies in json:
json_path = f"{save_file}/movies_colors.json"

# load existing movie titles if the JSON exists
if os.path.exists(json_path):
    with open(json_path, "r") as f:
        all_data = json.load(f)
        done_titles = set(d["title"] for d in all_data)
else:
    all_data = []
    done_titles = set()


# movies = ["One Battle After Another"]
df = pd.read_csv("all_movie_titles.csv")  # replace with your path
movies = df['title'].tolist()

failed_file = f"{save_file}/failed_movies.txt"


for movie in movies:
    if movie in done_titles:
        print(f"Skipping {movie}, already processed.")
        continue  # skip this movie

    print("For movie: " + movie)

    start = time.time()

    find_trailer_start = time.time()
    url = find_trailer(movie)

    if url is None:
        print(f"Could not find trailer for {movie}")
        with open(failed_file, "a", encoding="utf-8") as f:
            f.write(movie + "\n")
        continue

    find_trailer_end = time.time()
    print("Find trailer duration: " + str(find_trailer_end - find_trailer_start))

    download_start = time.time()
    path = download_video(url)
    if path is None:
        # Save failed movie title
        print(f"Download failed for {movie}, saving to failed list.")
        with open(failed_file, "a", encoding="utf-8") as f:
            f.write(movie + "\n")
        continue  # skip to next movie


    download_end = time.time()
    print("Download duration: " + str(download_end - download_start))

    s_barcode = time.time()
    avg_colors, overall_avg, four_opposites = video_to_color_barcode( path, f"{save_file}/" + safe_filename(movie) + ".png", 0.5)
    e_barcode = time.time()


    json_start = time.time()
    json_buffer.append({
        "title": movie,
        "avg_colors": [list(map(float, c)) for c in avg_colors],
        "overall_avg": list(map(float, overall_avg)),
        "four_opposites": [list(map(float, c)) for c in four_opposites]
    })

    if len(json_buffer) >= JSON_FLUSH_INTERVAL:
        print("flushing json buffer")
        all_data = flush_json_buffer(json_path, json_buffer, all_data)

    json_end = time.time()
    print(f"JSON duration: {json_end - json_start}")
    get_barcode_png(avg_colors, f"{save_file}/" + safe_filename(movie) + ".png")

    print("Convertion time: ", e_barcode - s_barcode)

    tmp_file = "video.mp4"

    end = time.time()

    print("Total Duration: ", end - start)
    print()


    if os.path.exists(tmp_file):
        os.remove(tmp_file)


all_data = flush_json_buffer(json_path, json_buffer, all_data)
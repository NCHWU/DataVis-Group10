import subprocess
import cv2  # pip install opencv-python
import numpy as np
import os
from url_finder import find_trailer

def download_video(url, out_path="video.mp4"):
    subprocess.run([
        "yt-dlp",
        "-f", "best[ext=mp4]/best",
        "-o", out_path,
        url
    ], check=True)
    return out_path

def video_to_color_barcode(video_path, output="barcode.png", max_uniform_ratio = 0.5, sample_rate=5):
    cap = cv2.VideoCapture(video_path)
    avg_colors = []
    i = 0


    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if i % sample_rate == 0:
            # Convert frame to a 2D array of tuples (for counting unique colors)
            # pixels = frame.reshape(-1, 3)
            # pixels_view = np.ascontiguousarray(pixels).view(
            #     np.dtype((np.void, pixels.dtype.itemsize * pixels.shape[1])))
            # unique, counts = np.unique(pixels_view, return_counts=True)
            # max_ratio = counts.max() / len(pixels)
            #
            # if max_ratio <= max_uniform_ratio:
            avg = frame.mean(axis=(0, 1))
            avg_colors.append(avg[::-1])  # BGR → RGB
        i += 1

    cap.release()

    # build barcode
    h = 300
    w = len(avg_colors)
    barcode = np.zeros((h, w, 3), dtype=np.uint8)
    for x, c in enumerate(avg_colors):
        barcode[:, x] = c

    cv2.imwrite(output, cv2.cvtColor(barcode, cv2.COLOR_RGB2BGR))
    return output


movies = [""]
for movie in movies:
    url = find_trailer(movie)
    path = download_video(url)
    barcode = video_to_color_barcode( path, "results/" + movie + ".png", 0.5)
    print("Saved:", barcode)

    tmp_file = "video.mp4"
    if os.path.exists(tmp_file):
        os.remove(tmp_file)
        print("deleted mp4")


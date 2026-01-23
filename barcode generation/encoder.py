"""Color extraction and barcode generation utilities."""
import numpy as np
from sklearn.metrics import pairwise_distances
from skimage import color
import cv2


def pick_most_different_colors(colors, n=4):
    """Select n most perceptually distinct colors using LAB color space."""
    colors = np.array(colors)  # shape (num_colors, 3)
    colors_lab = color.rgb2lab(colors[np.newaxis, :, :] / 255.0)[0]

    # start with the color farthest from the mean in Lab space
    mean_color = colors_lab.mean(axis=0)
    first_idx = np.argmax(np.linalg.norm(colors_lab - mean_color, axis=1))
    selected_indices = [first_idx]

    while len(selected_indices) < n:
        # compute distance from all colors to already selected
        dist = np.min(pairwise_distances(colors_lab, colors_lab[selected_indices]), axis=1)
        # exclude already selected
        dist[selected_indices] = -1
        next_idx = np.argmax(dist)
        selected_indices.append(next_idx)

    # return the original RGB colors
    return colors[selected_indices]

def get_barcode_png(avg_colors, save_file):
    """Generate and save a barcode image from a list of RGB colors."""
    h = 100
    w = len(avg_colors)
    barcode = np.zeros((h, w, 3), dtype=np.uint8)
    for x, c in enumerate(avg_colors):
        barcode[:, x] = c

    cv2.imwrite(save_file, cv2.cvtColor(barcode, cv2.COLOR_RGB2BGR))

    return save_file

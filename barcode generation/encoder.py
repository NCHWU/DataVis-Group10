import numpy as np
from sklearn.metrics import pairwise_distances
from skimage import color
import cv2

def pick_most_different_colors(colors, n=4):
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
    # build barcode, niet tijdrovend
    h = 100
    w = len(avg_colors)
    barcode = np.zeros((h, w, 3), dtype=np.uint8)
    for x, c in enumerate(avg_colors):
        barcode[:, x] = c

    cv2.imwrite(save_file, cv2.cvtColor(barcode, cv2.COLOR_RGB2BGR))

    return save_file


# # four_colors should be an array of shape (4, 3), values 0-255, RGB
# # OpenCV uses BGR, so we need to convert
# four_colors_bgr = four_opposites[:, ::-1].astype(np.uint8)
#
# # create a square image
# size = 100  # size of each color block
# img = np.zeros((2 * size, 2 * size, 3), dtype=np.uint8)
#
# # assign colors to each quadrant
# img[0:size, 0:size] = four_colors_bgr[0]  # top-left
# img[0:size, size:2 * size] = four_colors_bgr[1]  # top-right
# img[size:2 * size, 0:size] = four_colors_bgr[2]  # bottom-left
# img[size:2 * size, size:2 * size] = four_colors_bgr[3]  # bottom-right
#
# # show image
# cv2.imshow("4 Colors", img)
# cv2.waitKey(0)
# cv2.destroyAllWindows()




    # ###
    # # convert to uint8
    # overall_avg_uint8 = overall_avg.astype(np.uint8)
    #
    # # create an image
    # color_img = np.ones((100, 100, 3), dtype=np.uint8) * overall_avg_uint8
    #
    # # OpenCV uses BGR
    # color_img_bgr = cv2.cvtColor(color_img, cv2.COLOR_RGB2BGR)
    #
    # cv2.imshow("Average Color", color_img_bgr)
    # cv2.waitKey(0)
    # cv2.destroyAllWindows()


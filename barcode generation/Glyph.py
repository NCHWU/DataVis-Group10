import json
from PIL import Image, ImageDraw


def create_color_pictogram_for_movie(
    json_path,
    movie_title,
    out_path="pictogram.png",
    size=512,
    ring_width_ratio=0.5,
    gap_deg=8,
):
    """
    Create a color pictogram for a selected movie title.

    Required keys per movie:
      - title
      - four_opposites: [[r,g,b], ...] (length 4)
      - overall_avg: [r,g,b]
    """

    # Load JSON
    with open(json_path, "r", encoding="utf-8") as f:
        movies = json.load(f)

    # Find movie by title
    movie = next(
        (m for m in movies if m.get("title") == movie_title),
        None
    )

    if movie is None:
        raise ValueError(f"Movie '{movie_title}' not found")

    colors = movie["four_opposites"]
    center_color = tuple(map(int, movie["overall_avg"]))

    if len(colors) != 4:
        raise ValueError("four_opposites must contain exactly 4 colors")

    # Create image
    img = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)

    cx = cy = size // 2
    radius_outer = size * 0.48
    radius_inner = radius_outer * (1 - ring_width_ratio)
    center_radius = radius_inner * 0.65

    bbox_outer = [
        cx - radius_outer,
        cy - radius_outer,
        cx + radius_outer,
        cy + radius_outer,
    ]
    bbox_inner = [
        cx - radius_inner,
        cy - radius_inner,
        cx + radius_inner,
        cy + radius_inner,
    ]

    segment_angle = 360 / 4

    # Draw 4 segments
    for i, col in enumerate(colors):
        # start = i * segment_angle + gap_deg / 2
        # end = (i + 1) * segment_angle - gap_deg / 2
        start = i * 90
        end = (i + 1) * 90

        draw.pieslice(
            bbox_outer,
            start,
            end,
            fill=tuple(map(int, col)),
        )
        draw.pieslice(
            bbox_inner,
            start,
            end,
            fill=(255, 255, 255, 0),
        )

    gap = size * 0.1  # adjust gap width here

    # vertical gap
    draw.rectangle(
        [cx - gap / 2, cy - radius_outer, cx + gap / 2, cy + radius_outer],
        fill=(255, 255, 255, 0),
    )

    # horizontal gap
    draw.rectangle(
        [cx - radius_outer, cy - gap / 2, cx + radius_outer, cy + gap / 2],
        fill=(255, 255, 255, 0),
    )


    # Center circle
    draw.ellipse(
        [
            cx - center_radius,
            cy - center_radius,
            cx + center_radius,
            cy + center_radius,
        ],
        fill=center_color,
    )

    img.save(out_path)
    return out_path


create_color_pictogram_for_movie("results_nieuw/movies_colors.json", "Spectre")
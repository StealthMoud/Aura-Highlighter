import os
import struct
import zlib

def write_fallback_png(path, size, color_rgba):
    """Writes a basic colored block PNG file using standard library only."""
    width, height = size, size
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0) # filter type 0
        for x in range(width):
            # Draw a nice circle or rounded shape
            dx = x - width / 2
            dy = y - height / 2
            dist = (dx*dx + dy*dy) ** 0.5
            r, g, b, a = color_rgba
            if dist > (width / 2):
                raw_data.extend([0, 0, 0, 0])
            elif dist > (width / 2 - 2):
                # anti-alias edge
                alpha = int(a * (1 - (dist - (width / 2 - 2)) / 2))
                raw_data.extend([r, g, b, alpha])
            else:
                raw_data.extend([r, g, b, a])

    # PNG Signature
    png_bytes = b'\x89PNG\r\n\x1a\n'

    # IHDR chunk
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    png_bytes += struct.pack('>I', len(ihdr_data)) + b'IHDR' + ihdr_data + struct.pack('>I', zlib.crc32(b'IHDR' + ihdr_data))

    # IDAT chunk
    compressed = zlib.compress(raw_data)
    png_bytes += struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', zlib.crc32(b'IDAT' + compressed))

    # IEND chunk
    png_bytes += struct.pack('>I', 0) + b'IEND' + struct.pack('>I', zlib.crc32(b'IEND'))

    with open(path, 'wb') as f:
        f.write(png_bytes)

def main():
    os.makedirs('icons', exist_ok=True)
    sizes = [16, 48, 128]
    # Gorgeous Indigo base color: HSL(245, 80%, 62%) -> RGB(102, 85, 230)
    color = (102, 85, 230, 255)
    
    # Try using PIL first if available, for richer graphics
    try:
        from PIL import Image, ImageDraw
        print("Using PIL to generate premium gradient icons...")
        for s in sizes:
            img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
            draw = ImageDraw.Draw(img)
            # Draw aura glow
            draw.ellipse([0, 0, s-1, s-1], fill=(102, 85, 230, 240))
            # Draw a cute inner white core
            inner = s // 4
            draw.ellipse([inner, inner, s - inner - 1, s - inner - 1], fill=(255, 255, 255, 255))
            # Draw small highlight marker tip in primary color
            tip = s // 2
            draw.rectangle([tip - s//8, tip - s//8, tip + s//8, tip + s//8], fill=(102, 85, 230, 255))
            img.save(f'icons/icon-{s}.png')
    except ImportError:
        print("PIL not installed, using fallback PNG generator...")
        for s in sizes:
            write_fallback_png(f'icons/icon-{s}.png', s, color)

    print("Icons successfully generated inside icons/ directory.")

if __name__ == '__main__':
    main()

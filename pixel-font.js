/**
 * PIXEL-FONT.JS - 5x7 bitmap font renderer for the camcorder OSD.
 * Every glyph is drawn as fillRect blocks on an integer grid, so there is
 * no anti-aliasing anywhere (unlike ctx.font vector text).
 */

(function () {
    const GLYPHS = {
        '0': '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
        '1': '..#../.##../..#../..#../..#../..#../.###.',
        '2': '.###./#...#/....#/...#./..#../.#.../#####',
        '3': '.###./#...#/....#/..##./....#/#...#/.###.',
        '4': '...#./..##./.#.#./#..#./#####/...#./...#.',
        '5': '#####/#..../####./....#/....#/#...#/.###.',
        '6': '..##./.#.../#..../####./#...#/#...#/.###.',
        '7': '#####/....#/...#./..#../.#.../.#.../.#...',
        '8': '.###./#...#/#...#/.###./#...#/#...#/.###.',
        '9': '.###./#...#/#...#/.####/....#/...#./.##..',
        'A': '..#../.#.#./#...#/#...#/#####/#...#/#...#',
        'B': '####./#...#/#...#/####./#...#/#...#/####.',
        'C': '.####/#..../#..../#..../#..../#..../.####',
        'D': '####./#...#/#...#/#...#/#...#/#...#/####.',
        'E': '#####/#..../#..../####./#..../#..../#####',
        'F': '#####/#..../#..../####./#..../#..../#....',
        'G': '.####/#..../#..../#.###/#...#/#...#/.####',
        'H': '#...#/#...#/#...#/#####/#...#/#...#/#...#',
        'I': '.###./..#../..#../..#../..#../..#../.###.',
        'J': '...##/....#/....#/....#/....#/#...#/.###.',
        'K': '#...#/#..#./#.#../##.../#.#../#..#./#...#',
        'L': '#..../#..../#..../#..../#..../#..../#####',
        'M': '#...#/##.##/#.#.#/#...#/#...#/#...#/#...#',
        'N': '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#',
        'O': '.###./#...#/#...#/#...#/#...#/#...#/.###.',
        'P': '####./#...#/#...#/####./#..../#..../#....',
        'Q': '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
        'R': '####./#...#/#...#/####./#.#../#..#./#...#',
        'S': '.####/#..../#..../.###./....#/....#/####.',
        'T': '#####/..#../..#../..#../..#../..#../..#..',
        'U': '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
        'V': '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
        'W': '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
        'X': '#...#/.#.#./..#../..#../..#../.#.#./#...#',
        'Y': '#...#/.#.#./..#../..#../..#../..#../..#..',
        'Z': '#####/....#/...#./..#../.#.../#..../#####',
        ' ': '...../...../...../...../...../...../.....',
        ':': '...../..#../...../...../..#../...../.....',
        '.': '...../...../...../...../...../..#../.....',
        ',': '...../...../...../...../...../..#../.#...',
        '-': '...../...../...../#####/...../...../.....',
        '/': '....#/...#./..#../.#.../#..../...../.....',
        '%': '#...#/....#/...#./..#../.#.../#..../#...#',
        '+': '...../..#../..#../#####/..#../..#../.....',
        '*': '...../#.#.#/.###./#####/.###./#.#.#/.....',
        '?': '.###./#...#/....#/...#./..#../...../..#..',
        '!': '..#../..#../..#../..#../..#../...../..#..'
    };

    const CELLS_CACHE = new Map();

    function glyphCells(ch) {
        const key = ch.toUpperCase();
        if (CELLS_CACHE.has(key)) {
            return CELLS_CACHE.get(key);
        }
        const pattern = GLYPHS[key] || GLYPHS[' '];
        const rows = pattern.split('/');
        const cells = [];
        for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            for (let c = 0; c < row.length; c++) {
                if (row[c] === '#') {
                    cells.push([c, r]);
                }
            }
        }
        CELLS_CACHE.set(key, cells);
        return cells;
    }

    const GLYPH_W = 5;
    const GLYPH_H = 7;
    const ADVANCE = GLYPH_W + 1; // 1-unit space between glyphs

    function measure(text, unit) {
        if (!text.length) {
            return 0;
        }
        return (text.length * ADVANCE - 1) * unit;
    }

    function height(unit) {
        return GLYPH_H * unit;
    }

    function collectCells(text, unit, originX, originY) {
        const cells = [];
        for (let i = 0; i < text.length; i++) {
            const gCells = glyphCells(text[i]);
            const gx = originX + i * ADVANCE * unit;
            for (const [c, r] of gCells) {
                cells.push([gx + c * unit, originY + r * unit]);
            }
        }
        return cells;
    }

    function draw(ctx, text, x, y, opts) {
        opts = opts || {};
        const unit = opts.unit || 1;
        const color = opts.color || '#ffffff';
        const align = opts.align || 'left';
        const baseline = opts.baseline || 'top';

        const w = measure(text, unit);
        const h = height(unit);

        let originX = x;
        if (align === 'right') {
            originX = x - w;
        } else if (align === 'center') {
            originX = x - w / 2;
        }

        let originY = y;
        if (baseline === 'bottom') {
            originY = y - h;
        } else if (baseline === 'middle') {
            originY = y - h / 2;
        }

        const cells = collectCells(text, unit, Math.round(originX), Math.round(originY));

        ctx.save();

        if (opts.glow) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.14;
            ctx.fillStyle = color;
            const ringOffsets = [[-unit, 0], [unit, 0], [0, -unit], [0, unit]];
            for (const [ox, oy] of ringOffsets) {
                for (const [cx, cy] of cells) {
                    ctx.fillRect(cx + ox, cy + oy, unit, unit);
                }
            }
        }

        if (opts.shadow !== false) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#000000';
            const shadowOffsets = [[unit, unit], [unit, 0], [0, unit]];
            for (const [ox, oy] of shadowOffsets) {
                for (const [cx, cy] of cells) {
                    ctx.fillRect(cx + ox, cy + oy, unit, unit);
                }
            }
        }

        if (opts.fringe !== false) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.45;
            const fo = 0.4 * unit;

            ctx.fillStyle = '#ff2200';
            for (const [cx, cy] of cells) {
                ctx.fillRect(cx - fo, cy - fo, unit, unit);
            }

            ctx.fillStyle = '#0044ff';
            for (const [cx, cy] of cells) {
                ctx.fillRect(cx + fo, cy + fo, unit, unit);
            }
        }

        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        for (const [cx, cy] of cells) {
            ctx.fillRect(cx, cy, unit, unit);
        }

        ctx.restore();

        return w;
    }

    window.PixelFont = { measure, height, draw, GLYPH_W, GLYPH_H };
})();

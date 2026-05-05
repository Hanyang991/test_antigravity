/**
 * $P Point-Cloud Recognizer Engine
 * Adapted for Arcane Sandbox (Futhark/Angular Runes)
 */

const NUM_POINTS = 32;
const ORIGIN = { x: 0, y: 0 };

class Point {
    constructor(x, y, id) {
        this.x = x;
        this.y = y;
        this.id = id; // Stroke ID
    }
}

// Pre-defined Rune Templates (Radicals)
// We define them using simple coordinates which will be normalized anyway.
const RAW_TEMPLATES = [
    {
        name: '티와즈(↑)', // Tiwaz: Upward arrow
        strokes: [
            [{x: 50, y: 100}, {x: 50, y: 0}], // Stem
            [{x: 50, y: 0}, {x: 20, y: 30}],  // Left twig
            [{x: 50, y: 0}, {x: 80, y: 30}]   // Right twig
        ]
    },
    {
        name: '이사(|)', // Isa: Vertical line
        strokes: [
            [{x: 50, y: 0}, {x: 50, y: 100}]
        ]
    },
    {
        name: '게보(X)', // Gebo: X shape
        strokes: [
            [{x: 20, y: 20}, {x: 80, y: 80}],
            [{x: 80, y: 20}, {x: 20, y: 80}]
        ]
    },
    {
        name: '알기즈(Y)', // Algiz: Upward fork
        strokes: [
            [{x: 50, y: 100}, {x: 50, y: 50}], // Stem
            [{x: 50, y: 50}, {x: 20, y: 0}],   // Left twig
            [{x: 50, y: 50}, {x: 80, y: 0}]    // Right twig
        ]
    },
    {
        name: '대지(ㅡ)', // Horizontal line
        strokes: [
            [{x: 0, y: 50}, {x: 100, y: 50}]
        ]
    },
    {
        name: '원(○)', // Sowilo/Sun: closed circle (drawn with compass)
        strokes: (() => {
            const seg = 32;
            const cx = 50, cy = 50, r = 50;
            const pts = [];
            for (let i = 0; i <= seg; i++) {
                const theta = (i / seg) * Math.PI * 2;
                pts.push({ x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) });
            }
            return [pts];
        })()
    },
    {
        name: '케나즈(<)', // Kenaz: open angle pointing right (torch)
        strokes: [
            [{x: 100, y: 0},  {x: 0, y: 50}],
            [{x: 0,   y: 50}, {x: 100, y: 100}]
        ]
    },
    {
        name: '하갈라즈(H)', // Hagalaz: H shape (hail)
        strokes: [
            [{x: 0,   y: 0}, {x: 0,   y: 100}], // left vertical
            [{x: 100, y: 0}, {x: 100, y: 100}], // right vertical
            [{x: 0,  y: 50}, {x: 100, y: 50}]   // crossbar
        ]
    },
    {
        name: '에와즈(M)', // Ehwaz: M shape (horse / passage)
        strokes: [
            [{x: 0,   y: 100}, {x: 0,   y: 0}],   // left vertical (up)
            [{x: 0,   y: 0},   {x: 50,  y: 100}], // down to middle valley
            [{x: 50,  y: 100}, {x: 100, y: 0}],   // up to right peak
            [{x: 100, y: 0},   {x: 100, y: 100}]  // right vertical (down)
        ]
    },
    {
        name: '열기(△)', // Heat / fire (open triangle radical from README)
        strokes: [
            [{x: 50,  y: 0},   {x: 0,   y: 100}],
            [{x: 0,   y: 100}, {x: 100, y: 100}],
            [{x: 100, y: 100}, {x: 50,  y: 0}]
        ]
    },
    {
        name: '다가즈(◇)', // Dagaz: diamond (day / dawn)
        strokes: [
            [{x: 50,  y: 0},   {x: 100, y: 50}],
            [{x: 100, y: 50},  {x: 50,  y: 100}],
            [{x: 50,  y: 100}, {x: 0,   y: 50}],
            [{x: 0,   y: 50},  {x: 50,  y: 0}]
        ]
    },
    {
        name: '나우디즈(+)', // Naudhiz: cross / need
        strokes: [
            [{x: 50, y: 0}, {x: 50, y: 100}],
            [{x: 0, y: 50}, {x: 100, y: 50}]
        ]
    },
    {
        name: '라구즈(L)', // Laguz: L shape (water / flow)
        strokes: [
            [{x: 0, y: 0},   {x: 0,   y: 100}],
            [{x: 0, y: 100}, {x: 100, y: 100}]
        ]
    }
];

// Algorithm Math Functions
function PathLength(points) {
    let d = 0.0;
    for (let i = 1; i < points.length; i++) {
        if (points[i].id === points[i - 1].id) {
            d += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
        }
    }
    return d;
}

function Resample(points, n) {
    if (points.length === 0) return [];
    let I = PathLength(points) / (n - 1);
    let D = 0.0;
    let newpoints = [new Point(points[0].x, points[0].y, points[0].id)];
    
    for (let i = 1; i < points.length; i++) {
        if (points[i].id === points[i - 1].id) {
            let d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
            if ((D + d) >= I) {
                let qx = points[i - 1].x + ((I - D) / d) * (points[i].x - points[i - 1].x);
                let qy = points[i - 1].y + ((I - D) / d) * (points[i].y - points[i - 1].y);
                let q = new Point(qx, qy, points[i].id);
                newpoints.push(q);
                points.splice(i, 0, q); // insert q at position i
                D = 0.0;
            } else {
                D += d;
            }
        }
    }
    // catch rounding error
    if (newpoints.length == n - 1) {
        newpoints.push(new Point(points[points.length - 1].x, points[points.length - 1].y, points[points.length - 1].id));
    }
    return newpoints;
}

// Anisotropic scale to [0,1]^2 with a degenerate-axis fallback.
//
// The original $P uses uniform scale (max(width, height)). That made the
// recognizer aspect-ratio-sensitive: a stretched H or M would no longer
// match its 1:1 template. We use anisotropic scale (independent x/y
// normalization) so a 240×160 H still matches the 100×100 template.
//
// Single-line runes (이사 = pure vertical, 대지 = pure horizontal) and
// near-degenerate strokes have one axis ≈ 0, so a pure anisotropic scale
// would either divide by zero or amplify noise on that axis to a full unit
// span. When one axis is much smaller than the other (< 10% of the larger),
// fall back to uniform scale so single-line shapes keep their distinctive
// 1D footprint inside the unit box.
function Scale(points) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < points.length; i++) {
        minX = Math.min(minX, points[i].x);
        minY = Math.min(minY, points[i].y);
        maxX = Math.max(maxX, points[i].x);
        maxY = Math.max(maxY, points[i].y);
    }
    const width = maxX - minX;
    const height = maxY - minY;
    const maxSize = Math.max(width, height);
    if (maxSize === 0) return points;

    const minRatio = 0.1;
    let scaleX, scaleY;
    if (width < maxSize * minRatio || height < maxSize * minRatio) {
        scaleX = scaleY = maxSize;
    } else {
        scaleX = width;
        scaleY = height;
    }

    let newpoints = [];
    for (let i = 0; i < points.length; i++) {
        let qx = (points[i].x - minX) / scaleX;
        let qy = (points[i].y - minY) / scaleY;
        newpoints.push(new Point(qx, qy, points[i].id));
    }
    return newpoints;
}

function TranslateTo(points, pt) {
    let cx = 0.0, cy = 0.0;
    for (let i = 0; i < points.length; i++) {
        cx += points[i].x;
        cy += points[i].y;
    }
    cx /= points.length;
    cy /= points.length;
    
    let newpoints = [];
    for (let i = 0; i < points.length; i++) {
        let qx = points[i].x + pt.x - cx;
        let qy = points[i].y + pt.y - cy;
        newpoints.push(new Point(qx, qy, points[i].id));
    }
    return newpoints;
}

function CloudDistance(pts1, pts2, start) {
    let matched = new Array(pts1.length).fill(false);
    let sum = 0;
    let i = start;
    do {
        let index = -1;
        let min = Infinity;
        for (let j = 0; j < matched.length; j++) {
            if (!matched[j]) {
                let d = Math.hypot(pts1[i].x - pts2[j].x, pts1[i].y - pts2[j].y);
                if (d < min) {
                    min = d;
                    index = j;
                }
            }
        }
        matched[index] = true;
        let weight = 1 - ((i - start + pts1.length) % pts1.length) / pts1.length;
        sum += weight * min;
        i = (i + 1) % pts1.length;
    } while (i !== start);
    return sum;
}

function GreedyCloudMatch(pts1, pts2) {
    let e = 0.50;
    let step = Math.floor(Math.pow(pts1.length, 1 - e));
    let min = Infinity;
    for (let i = 0; i < pts1.length; i += step) {
        let d1 = CloudDistance(pts1, pts2, i);
        let d2 = CloudDistance(pts2, pts1, i);
        min = Math.min(min, Math.min(d1, d2));
    }
    return min;
}

class Template {
    constructor(name, rawStrokes) {
        this.name = name;
        let points = [];
        for (let i = 0; i < rawStrokes.length; i++) {
            for (let j = 0; j < rawStrokes[i].length; j++) {
                points.push(new Point(rawStrokes[i][j].x, rawStrokes[i][j].y, i));
            }
        }
        this.points = Resample(points, NUM_POINTS);
        this.points = Scale(this.points);
        this.points = TranslateTo(this.points, ORIGIN);
    }
}

export class RecognitionEngine {
    // Acceptance distance in normalized [0,1]^2 cloud space. See identifyRune.
    // Anisotropic Scale lets stretched H/M/◇ match their templates, but tightens
    // some sub-feature proportions (e.g. Tiwaz twig depth relative to stem),
    // pushing some canonical drawings up to ~0.85. Random scribble distances
    // sit around 1.5+, so 0.95 keeps a comfortable margin while admitting
    // moderately stretched shapes.
    static MATCH_THRESHOLD = 0.95;

    constructor() {
        this.templates = RAW_TEMPLATES.map(t => new Template(t.name, t.strokes));
    }

    identifyRune(strokes) {
        if (strokes.length === 0) return null;
        
        let points = [];
        for (let i = 0; i < strokes.length; i++) {
            for (let j = 0; j < strokes[i].length; j++) {
                points.push(new Point(strokes[i][j].x, strokes[i][j].y, i));
            }
        }
        if (points.length < 5) return null;

        points = Resample(points, NUM_POINTS);
        points = Scale(points);
        points = TranslateTo(points, ORIGIN);

        let bestMatch = null;
        let bestDistance = Infinity;

        for (let t of this.templates) {
            let dist = GreedyCloudMatch(points, t.points);
            if (dist < bestDistance) {
                bestDistance = dist;
                bestMatch = t;
            }
        }

        // Distance threshold for a valid match (lower is better, max distance is around 1.4 for 1x1 box).
        // Empirically, freehand drawings of multi-stroke runes (Tiwaz, Algiz, Gebo) routinely
        // produce distances in the 0.5–0.8 range; 0.45 was too strict and rejected most real input.
        if (bestDistance > RecognitionEngine.MATCH_THRESHOLD) return null;

        console.log(`[P$ Recognizer] Matched: ${bestMatch.name} with dist: ${bestDistance.toFixed(3)}`);
        return bestMatch.name;
    }

    identifyBone(strokes) {
        // Simplified fallback for bones since P$ handles complex runes
        // We can just use the P$ recognizer for bones too, or keep it simple.
        // Let's use P$ for bones but with different templates.
        // For now, if strokes make a square, circle, triangle.
        return null; // Will implement if needed, focusing on Runes first.
    }

    analyzeRune(runeStrokes, boneStrokes = []) {
        if (runeStrokes.length === 0) {
            return { radicals: [], dynamics: '대기 중', meaning: '알 수 없는 문양', compoundName: null, avgSpeed: 0, instabilityModifier: 0 };
        }

        let totalSpeed = 0;
        let speedSamples = 0;

        // Calculate speed
        runeStrokes.forEach(stroke => {
            if (stroke.length < 2) return;
            const timeDiff = stroke[stroke.length - 1].t - stroke[0].t;
            let distance = 0;
            for(let i=1; i<stroke.length; i++) {
                distance += Math.hypot(stroke[i].x - stroke[i-1].x, stroke[i].y - stroke[i-1].y);
            }
            const speed = timeDiff > 0 ? distance / timeDiff : 0;
            totalSpeed += speed;
            speedSamples++;
        });

        const avgSpeed = speedSamples > 0 ? totalSpeed / speedSamples : 0;
        let dynamics = '안정적(지속)';
        if (avgSpeed > 1.5) dynamics = '거침(폭발적)';
        else if (avgSpeed < 0.3) dynamics = '느림(응축)';

        // Compute the overall bounding box (used for radical-extraction fallback below).
        const overallBbox = bboxOfStrokes(runeStrokes);
        const overallSize = Math.max(overallBbox.w, overallBbox.h);

        let finalMeaning = '알 수 없는 문양';
        let instabilityBonus = 20;
        let radicalModifiers = [];
        let radicalCount = 0;
        let compoundName = null;
        let compoundDynamics = null;

        // Pass 1 (compound, README "radical combination"): try to find a
        // partition of the strokes into "main rune" + "radical rune" where each
        // half identifies as a known template AND the pair has an entry in the
        // positional combination table. This catches:
        //   - well-separated drawings (열기△ next to 대지ㅡ below it),
        //   - and overlapping ones (대지ㅡ drawn through the middle of △).
        // Two strategies:
        //   (a) spatial clustering — fast, handles separated drawings,
        //   (b) leave-one-stroke-out — handles cases where the radical bbox
        //       overlaps the main rune (e.g. bar through center).
        // Compound only fires when a (mainName, radicalName, position) tuple
        // has an explicit COMBINATIONS entry, so spurious template matches on
        // sub-stroke groupings can't produce false positives.
        const tryCompound = (groupA, groupB) => {
            if (groupA.length === 0 || groupB.length === 0) return null;
            const idA = this.identifyRune(groupA);
            const idB = this.identifyRune(groupB);
            if (!idA || !idB) return null;
            const bA = bboxOfStrokes(groupA);
            const bB = bboxOfStrokes(groupB);
            // The "main" cluster is whichever has more strokes; ties broken by
            // larger bounding box. The other cluster is the radical/decorator.
            const isAMain =
                groupA.length > groupB.length ||
                (groupA.length === groupB.length && bA.w * bA.h >= bB.w * bB.h);
            const mainName = isAMain ? idA : idB;
            const radicalName = isAMain ? idB : idA;
            const mainBbox = isAMain ? bA : bB;
            const radicalBbox = isAMain ? bB : bA;
            const position = relativePosition(mainBbox, radicalBbox);
            return lookupCombination(mainName, radicalName, position);
        };

        let combo = null;
        // (a) Spatial clusters.
        const clusters = clusterStrokesByProximity(runeStrokes);
        if (clusters.length === 2) {
            combo = tryCompound(clusters[0], clusters[1]);
        }
        // (b) Leave-one-stroke-out (only when clustering didn't already find a
        // combination, and only for stroke counts where the search is cheap).
        if (!combo && runeStrokes.length >= 2 && runeStrokes.length <= 6) {
            for (let i = 0; i < runeStrokes.length && !combo; i++) {
                const main = runeStrokes.filter((_, j) => j !== i);
                const radical = [runeStrokes[i]];
                combo = tryCompound(main, radical);
            }
        }
        if (combo) {
            compoundName = combo.name;
            compoundDynamics = combo.dynamics || null;
            finalMeaning = combo.name;
            instabilityBonus = combo.instabilityBonus;
        }

        // Pass 2: try matching ALL strokes as one rune. Multi-stroke runes like Tiwaz/Algiz
        // have inherent size variation (long stem + shorter twigs). The previous logic stripped
        // the twigs as 'radicals' before matching, leaving only the stem and turning Tiwaz into
        // [변이된]×2 이사(|). Try a holistic match first so well-drawn runes are recognized as-is.
        let matchedRune = compoundName ? null : this.identifyRune(runeStrokes);

        // Pass 3: only if both compound + holistic matches failed, treat clearly-small strokes
        // as decorative radicals and rematch the remaining "main" strokes. This preserves
        // the legacy [응축된]/[차단된]/[탈취의]/[변이된] modifier flavor for cases the
        // positional combo table doesn't cover.
        if (!compoundName && !matchedRune) {
            const mainStrokes = [];
            runeStrokes.forEach(stroke => {
                const b = bboxOfStrokes([stroke]);
                const size = Math.max(b.w, b.h);

                // Only strip truly small strokes (< 15% of overall bbox, and the rune itself is
                // big enough to make "small" meaningful). The old 20% cutoff was eating Tiwaz twigs
                // (which sit right at ~15% of the rune's bbox).
                if (size < overallSize * 0.15 && overallSize > 50) {
                    radicalCount++;
                    if (b.w < 15 && b.h < 15) {
                        radicalModifiers.push('[응축된]'); // Dot
                    } else if (b.w > b.h * 2) {
                        radicalModifiers.push('[차단된]'); // Horizontal Bar
                    } else if (b.h > b.w * 2) {
                        radicalModifiers.push('[탈취의]'); // Vertical Hook
                    } else {
                        radicalModifiers.push('[변이된]'); // Generic wave/curve
                    }
                } else {
                    mainStrokes.push(stroke);
                }
            });

            if (mainStrokes.length > 0 && mainStrokes.length < runeStrokes.length) {
                matchedRune = this.identifyRune(mainStrokes);
            }
        }

        if (!compoundName && matchedRune) {
            finalMeaning = matchedRune;
            instabilityBonus = 0;
        }

        // Apply Radicals (legacy modifier text). Skipped when a compound name took over,
        // since that name already encodes the relationship.
        if (!compoundName && radicalModifiers.length > 0) {
            finalMeaning = `${radicalModifiers.join(' ')} ${finalMeaning}`;
        }

        // Apply Bone Modifiers
        let primaryBone = null;
        if(boneStrokes.length > 0) {
           if(boneStrokes.length === 1) primaryBone = 'circle';
           else if(boneStrokes.length === 3) primaryBone = 'triangle';
           else if(boneStrokes.length === 4) primaryBone = 'square';
        }

        if (primaryBone) {
            if (primaryBone === 'circle') finalMeaning = `[광역] ${finalMeaning}`;
            else if (primaryBone === 'triangle') finalMeaning = `[관통] ${finalMeaning}`;
            else if (primaryBone === 'square') finalMeaning = `[결계] ${finalMeaning}`;
        }

        let radArr = [];
        for(let i=0; i<radicalCount; i++) radArr.push('radical');

        return {
            radicals: radArr,
            dynamics: compoundDynamics || dynamics,
            meaning: finalMeaning,
            compoundName: compoundName,
            avgSpeed: avgSpeed,
            instabilityModifier: instabilityBonus
        };
    }
}

// --- Spatial helpers and combination table ---------------------------------

// Return {minX, minY, maxX, maxY, w, h, cx, cy} for a list of strokes.
function bboxOfStrokes(strokes) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    strokes.forEach(stroke => {
        stroke.forEach(pt => {
            if (pt.x < minX) minX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y > maxY) maxY = pt.y;
        });
    });
    if (minX === Infinity) {
        return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0, cx: 0, cy: 0 };
    }
    return {
        minX, minY, maxX, maxY,
        w: maxX - minX,
        h: maxY - minY,
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2,
    };
}

// Cluster strokes into spatially separate groups. Two strokes belong to the
// same group when their bounding boxes (inflated by `pad`) overlap. Used to
// detect "two runes drawn next to each other" for compound matching.
function clusterStrokesByProximity(strokes) {
    if (strokes.length <= 1) return strokes.map(s => [s]);
    const overall = bboxOfStrokes(strokes);
    // Pad by 6% of the overall span on each side; this is loose enough that
    // a Tiwaz stem and twigs which actually touch get merged, but tight enough
    // that a separately-drawn 대지(ㅡ) below a △ stays its own group.
    const pad = Math.max(overall.w, overall.h) * 0.06;
    const boxes = strokes.map(s => bboxOfStrokes([s]));
    const parent = strokes.map((_, i) => i);
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
    for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i], b = boxes[j];
            const overlapsX = a.minX - pad <= b.maxX && b.minX - pad <= a.maxX;
            const overlapsY = a.minY - pad <= b.maxY && b.minY - pad <= a.maxY;
            if (overlapsX && overlapsY) union(i, j);
        }
    }
    const buckets = new Map();
    for (let i = 0; i < strokes.length; i++) {
        const r = find(i);
        if (!buckets.has(r)) buckets.set(r, []);
        buckets.get(r).push(strokes[i]);
    }
    return Array.from(buckets.values());
}

// Classify the radical's center relative to the main rune's bbox.
// Y axis grows downward (canvas convention), so smaller y === "above".
// Returns one of: 'above', 'below', 'left', 'right', 'middle'.
function relativePosition(mainBbox, radicalBbox) {
    const dx = radicalBbox.cx - mainBbox.cx;
    const dy = radicalBbox.cy - mainBbox.cy;
    // "Inside" the main rune both horizontally and vertically → middle.
    const insideX = radicalBbox.cx >= mainBbox.minX && radicalBbox.cx <= mainBbox.maxX;
    const insideY = radicalBbox.cy >= mainBbox.minY && radicalBbox.cy <= mainBbox.maxY;
    if (insideX && insideY) return 'middle';
    // Otherwise pick the dominant axis.
    if (Math.abs(dy) >= Math.abs(dx)) {
        return dy < 0 ? 'above' : 'below';
    }
    return dx < 0 ? 'left' : 'right';
}

// Positional combination table. README's seed example was 열기△ + 대지ㅡ → 마그마.
// We extend along that axis: same two runes give different results depending on
// where the bar sits relative to the triangle, plus a couple lore-friendly combos
// for 이사(|) and 원(○). Add more entries here over time.
const COMBINATIONS = [
    { main: '열기(△)', radical: '대지(ㅡ)', position: 'below',  name: '마그마',     dynamics: '꿈틀거림(흐름)',   instabilityBonus: 30 },
    { main: '열기(△)', radical: '대지(ㅡ)', position: 'middle', name: '증기',       dynamics: '뜨거움(확산)',     instabilityBonus: 50 },
    { main: '열기(△)', radical: '대지(ㅡ)', position: 'above',  name: '폭발',       dynamics: '거침(임계)',       instabilityBonus: 80 },
    { main: '이사(|)', radical: '이사(|)',  position: 'right',  name: '쌍둥이 기둥', dynamics: '안정적(공명)',     instabilityBonus: 0  },
    { main: '원(○)',   radical: '대지(ㅡ)', position: 'middle', name: '봉인된 태양', dynamics: '갇힘(억눌림)',     instabilityBonus: 40 },
    { main: '원(○)',   radical: '대지(ㅡ)', position: 'below',  name: '일출',       dynamics: '느림(응축)',       instabilityBonus: 10 },
    { main: '원(○)',   radical: '대지(ㅡ)', position: 'above',  name: '일몰',       dynamics: '느림(응축)',       instabilityBonus: 10 },
    { main: '하갈라즈(H)', radical: '대지(ㅡ)', position: 'below', name: '얼어붙은 강', dynamics: '안정적(지속)',  instabilityBonus: 0  },
];

function lookupCombination(mainName, radicalName, position) {
    return COMBINATIONS.find(c => c.main === mainName && c.radical === radicalName && c.position === position) || null;
}

// Exposed for tests and debug.
export const __INTERNAL__ = { bboxOfStrokes, clusterStrokesByProximity, relativePosition, lookupCombination, COMBINATIONS };

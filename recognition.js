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

function Scale(points) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < points.length; i++) {
        minX = Math.min(minX, points[i].x);
        minY = Math.min(minY, points[i].y);
        maxX = Math.max(maxX, points[i].x);
        maxY = Math.max(maxY, points[i].y);
    }
    const size = Math.max(maxX - minX, maxY - minY);
    if (size === 0) return points; // Cannot scale a single point
    
    let newpoints = [];
    for (let i = 0; i < points.length; i++) {
        let qx = (points[i].x - minX) / size;
        let qy = (points[i].y - minY) / size;
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

        // Distance threshold for a valid match (lower is better, max distance is around 1.4 for 1x1 box)
        if (bestDistance > 0.45) return null;

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
            return { radicals: [], dynamics: '대기 중', meaning: '알 수 없는 문양', avgSpeed: 0, instabilityModifier: 0 };
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

        // Radical Extraction Algorithm
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        runeStrokes.forEach(stroke => {
            stroke.forEach(pt => {
                minX = Math.min(minX, pt.x);
                minY = Math.min(minY, pt.y);
                maxX = Math.max(maxX, pt.x);
                maxY = Math.max(maxY, pt.y);
            });
        });
        const overallSize = Math.max(maxX - minX, maxY - minY);
        
        let mainStrokes = [];
        let radicalModifiers = [];
        let radicalCount = 0;

        runeStrokes.forEach(stroke => {
            let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity;
            stroke.forEach(pt => {
                sMinX = Math.min(sMinX, pt.x);
                sMinY = Math.min(sMinY, pt.y);
                sMaxX = Math.max(sMaxX, pt.x);
                sMaxY = Math.max(sMaxY, pt.y);
            });
            const w = sMaxX - sMinX;
            const h = sMaxY - sMinY;
            const size = Math.max(w, h);
            
            // If the stroke is very small compared to the overall rune, it's a radical
            if (size < overallSize * 0.20 && overallSize > 50) {
                radicalCount++;
                if (w < 15 && h < 15) {
                    radicalModifiers.push('[응축된]'); // Dot
                } else if (w > h * 2) {
                    radicalModifiers.push('[차단된]'); // Horizontal Bar
                } else if (h > w * 2) {
                    radicalModifiers.push('[탈취의]'); // Vertical Hook
                } else {
                    radicalModifiers.push('[변이된]'); // Generic wave/curve
                }
            } else {
                mainStrokes.push(stroke);
            }
        });

        let finalMeaning = '알 수 없는 문양';
        let instabilityBonus = 20;

        // Identify the main shape
        const matchedRune = this.identifyRune(mainStrokes.length > 0 ? mainStrokes : runeStrokes);
        if (matchedRune) {
            finalMeaning = matchedRune;
            instabilityBonus = 0; 
        }

        // Apply Radicals
        if (radicalModifiers.length > 0) {
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
            dynamics: dynamics,
            meaning: finalMeaning,
            avgSpeed: avgSpeed,
            instabilityModifier: instabilityBonus
        };
    }
}

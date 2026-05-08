import os

css_path = r'f:\test_antigravity\style.css'
with open(css_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Root variables
content = content.replace('''
:root {
  --color-bg: #050508;
  --color-primary: #8a2be2; /* Neon Purple */
  --color-secondary: #00ffff; /* Neon Cyan */
  --color-danger: #ff3366; /* Neon Pink/Red */
  --color-text: #e0e0ff;
  --color-text-muted: #8888aa;
  --color-panel-bg: rgba(15, 15, 25, 0.6);
  --color-panel-border: rgba(138, 43, 226, 0.3);
  
  --font-main: 'Outfit', sans-serif;
  --font-data: 'Share Tech Mono', monospace;
}
'''.strip(), '''
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&display=swap');

:root {
  --color-bg: #e1d5c1; /* Parchment base */
  --color-primary: #8b0000; /* Dark Red / Blood Ink */
  --color-secondary: #4b3e2a; /* Dark Brown / Ink */
  --color-danger: #8b0000; /* Dark Red */
  --color-text: #2c241b; /* Dark Ink */
  --color-text-muted: #6b5e4a; /* Faded Ink */
  --color-panel-bg: rgba(235, 226, 208, 0.9); /* Light Parchment Panel */
  --color-panel-border: rgba(107, 94, 74, 0.4);
  
  --font-main: 'Cormorant Garamond', serif;
  --font-data: 'Cormorant Garamond', serif;
}
'''.strip())

# 2. Body background
content = content.replace(
    'background-color: var(--color-bg);',
    "background-color: var(--color-bg);\n  background-image: url('data:image/svg+xml;utf8,<svg width=\"200\" height=\"200\" xmlns=\"http://www.w3.org/2000/svg\"><filter id=\"noiseFilter\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"0.8\" numOctaves=\"3\" stitchTiles=\"stitch\"/></filter><rect width=\"100%\" height=\"100%\" filter=\"url(%23noiseFilter)\" opacity=\"0.08\"/></svg>');"
)

# 3. Glass panel
content = content.replace(
    'box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);',
    'box-shadow: 2px 4px 15px rgba(44, 36, 27, 0.15), inset 0 0 40px rgba(139, 69, 19, 0.05);'
)
content = content.replace('border-radius: 12px;', 'border-radius: 4px;')
content = content.replace('backdrop-filter: blur(10px);', 'backdrop-filter: blur(4px);')
content = content.replace('-webkit-backdrop-filter: blur(10px);', '-webkit-backdrop-filter: blur(4px);')

# 4. Remove neon text shadows and adjust borders
content = content.replace('border: 1px solid rgba(255,255,255,0.16);', 'border: 1px solid rgba(107, 94, 74, 0.5);')
content = content.replace('background: rgba(255,255,255,0.04);', 'background: rgba(107, 94, 74, 0.1);')
content = content.replace('rgba(255,255,255,0.1)', 'rgba(107, 94, 74, 0.2)')
content = content.replace('rgba(0,255,255,0.25)', 'rgba(139, 0, 0, 0.4)')
content = content.replace('color: #00ffff;', 'color: var(--color-secondary);')
content = content.replace('color: #ffaa00;', 'color: #8b0000;')
content = content.replace('color: #ffd97a;', 'color: #2c241b;')
content = content.replace('color: #5fdfff;', 'color: #2c241b;')
content = content.replace('color: #cccccc;', 'color: var(--color-text-muted);')
content = content.replace('color: #92d7ff;', 'color: var(--color-secondary);')
content = content.replace('color: #c7c9dc;', 'color: var(--color-text);')
content = content.replace('color: #7f8ba7;', 'color: var(--color-text-muted);')
content = content.replace('color: #dde6ff;', 'color: var(--color-text);')
content = content.replace('color: #d2c39a;', 'color: #8b0000;')
content = content.replace('border: 1px solid rgba(255,255,255,0.08);', 'border: 1px dashed rgba(107, 94, 74, 0.3);')
content = content.replace('background: rgba(0, 0, 0, 0.24);', 'background: rgba(255, 255, 255, 0.3);')

# 5. Buttons and inputs
content = content.replace('background: rgba(0,0,0,0.5);', 'background: rgba(255,255,255,0.4);')
content = content.replace('color: #fff;', 'color: var(--color-text);')
content = content.replace('border-radius: 20px;', 'border-radius: 2px;')

# 6. Modal
content = content.replace('background: rgba(12, 12, 24, 0.92);', 'background: #e1d5c1;')
content = content.replace('border: 1px solid rgba(138, 43, 226, 0.28);', 'border: 2px solid #4b3e2a;')
content = content.replace('color: #d7dcff;', 'color: var(--color-text);')
content = content.replace('border-radius: 10px;', 'border-radius: 4px;')

# 7. UI Pulse animations
content = content.replace('box-shadow: 0 0 24px rgba(138, 43, 226, 0.42);', 'box-shadow: 0 0 15px rgba(139, 0, 0, 0.3);')
content = content.replace('box-shadow: 0 0 30px rgba(0, 255, 153, 0.42);', 'box-shadow: 0 0 15px rgba(85, 107, 47, 0.4);')
content = content.replace('rgba(0, 0, 0, 0.37)', 'rgba(44, 36, 27, 0.15)')

# 8. Rift/Demand -> Professor Assignment styling
# The demand block was dark transparent. Let's make it look like a professor's note
content = content.replace('background: rgba(0,0,0,0.4);', 'background: #f4ecdb;')
content = content.replace('border: 1px dashed rgba(255,170,0,0.5);', 'border: 1px solid #4b3e2a;')

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("css style done")

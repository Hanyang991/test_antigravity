import os

main_js_path = r'f:\test_antigravity\main.js'

with open(main_js_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add lastAnalyzeTime
content = content.replace(
    'let drawStartPt = null;',
    'let drawStartPt = null;\nlet lastAnalyzeTime = 0;'
)

# 2. Throttle draw()
content = content.replace(
    '  // Simple analysis update on draw\n  analyzeCurrentState();',
    '  // Simple analysis update on draw\n  if (now - lastAnalyzeTime > 150) {\n    analyzeCurrentState();\n    lastAnalyzeTime = now;\n  }'
)
content = content.replace(
    '  // Simple analysis update on draw\r\n  analyzeCurrentState();',
    '  // Simple analysis update on draw\r\n  if (now - lastAnalyzeTime > 150) {\r\n    analyzeCurrentState();\r\n    lastAnalyzeTime = now;\r\n  }'
)

# 3. Update stopDrawing()
content = content.replace(
    '  drawStartPt = null;\n  analyzeCurrentState();',
    '  drawStartPt = null;\n  analyzeCurrentState();\n  lastAnalyzeTime = Date.now();'
)
content = content.replace(
    '  drawStartPt = null;\r\n  analyzeCurrentState();',
    '  drawStartPt = null;\r\n  analyzeCurrentState();\r\n  lastAnalyzeTime = Date.now();'
)

with open(main_js_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("done")

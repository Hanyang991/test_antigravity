import os

main_js_path = r'f:\test_antigravity\main.js'
with open(main_js_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Background colors
content = content.replace("ctx.fillStyle = 'rgba(0, 50, 100, 0.1)';", "ctx.fillStyle = 'rgba(40, 60, 90, 0.1)';")
content = content.replace("ctx.fillStyle = 'rgba(20, 10, 30, 0.3)';", "ctx.fillStyle = 'rgba(25, 20, 15, 0.15)';")

# 2. Stroke styles
content = content.replace("ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';\n      ctx.lineWidth = 2;\n      ctx.shadowColor = 'rgba(0, 255, 255, 0.5)';\n      ctx.shadowBlur = 10;", "ctx.strokeStyle = 'rgba(120, 100, 80, 0.7)';\n      ctx.lineWidth = 1.5;\n      ctx.shadowBlur = 0;")
content = content.replace("ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';\r\n      ctx.lineWidth = 2;\r\n      ctx.shadowColor = 'rgba(0, 255, 255, 0.5)';\r\n      ctx.shadowBlur = 10;", "ctx.strokeStyle = 'rgba(120, 100, 80, 0.7)';\r\n      ctx.lineWidth = 1.5;\r\n      ctx.shadowBlur = 0;")

content = content.replace("ctx.strokeStyle = 'rgba(255, 51, 102, 0.9)';\n      ctx.lineWidth = 4;\n      ctx.shadowColor = 'rgba(255, 51, 102, 0.8)';\n      ctx.shadowBlur = 15;", "ctx.strokeStyle = 'rgba(30, 20, 10, 0.9)';\n      ctx.lineWidth = 3.5;\n      ctx.shadowBlur = 0;")
content = content.replace("ctx.strokeStyle = 'rgba(255, 51, 102, 0.9)';\r\n      ctx.lineWidth = 4;\r\n      ctx.shadowColor = 'rgba(255, 51, 102, 0.8)';\r\n      ctx.shadowBlur = 15;", "ctx.strokeStyle = 'rgba(30, 20, 10, 0.9)';\r\n      ctx.lineWidth = 3.5;\r\n      ctx.shadowBlur = 0;")

# 3. Wave and Burst
content = content.replace("'rgba(0,255,255,0.5)' : 'rgba(255,51,102,0.45)'", "'rgba(120, 100, 80, 0.4)' : 'rgba(40, 30, 20, 0.5)'")
content = content.replace("'rgba(0,255,255,0.85)' : 'rgba(255,110,140,0.9)'", "'rgba(120, 100, 80, 0.6)' : 'rgba(40, 30, 20, 0.7)'")

# Cast colors
content = content.replace("'rgba(0, 255, 153, 0.45)'", "'rgba(100, 150, 80, 0.5)'")
content = content.replace("'rgba(0, 255, 153, 0.65)'", "'rgba(100, 150, 80, 0.65)'")
content = content.replace("'rgba(0, 255, 153, 0.95)'", "'rgba(100, 150, 80, 0.95)'")

content = content.replace("'rgba(255, 51, 102, 0.45)'", "'rgba(180, 50, 40, 0.5)'")
content = content.replace("'rgba(255, 51, 102, 0.65)'", "'rgba(180, 50, 40, 0.65)'")

content = content.replace("'rgba(138, 43, 226, 0.45)'", "'rgba(80, 60, 120, 0.5)'")
content = content.replace("'rgba(138, 43, 226, 0.5)'", "'rgba(80, 60, 120, 0.5)'")
content = content.replace("'rgba(170, 130, 255, 0.9)'", "'rgba(80, 60, 120, 0.9)'")

# Graph
content = content.replace("state.instability > 80 ? '#ff3366' : '#00ffff'", "state.instability > 80 ? '#8b0000' : '#4b3e2a'")

# Overload
content = content.replace("'rgba(255, 51, 102, 0.8)'", "'rgba(139, 0, 0, 0.8)'")
content = content.replace("'rgba(255, 70, 70, 0.95)'", "'rgba(139, 0, 0, 0.95)'")
content = content.replace("'rgba(255, 0, 0, 0.2)'", "'rgba(139, 0, 0, 0.3)'")
content = content.replace("'#ff3366'", "'#8b0000'")

with open(main_js_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("ink style done")

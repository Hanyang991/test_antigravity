import { defineConfig } from 'vite';

// GitHub Pages 는 https://<owner>.github.io/<repo>/ 서브경로로 서빙되므로
// production 빌드 시 base 를 '/test_antigravity/' 로 잡아 asset 경로를 맞춘다.
// dev/preview 에서는 root('/') 그대로 동작.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/test_antigravity/' : '/',
}));

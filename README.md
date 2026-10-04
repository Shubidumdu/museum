# 🏛️ Atelier Museum (디지털 아트워크 박물관)

Vite의 멀티페이지(Multi-Page App, MPA) 기능을 기반으로 구축된 디지털 아트워크 컬렉션 박물관 프로젝트입니다.

---

## 📂 프로젝트 구조

```text
museum/
├── index.html                   # 박물관 메인 로비 (아트워크 갤러리 목록)
├── vite.config.ts               # artworks/**/index.html을 자동 감지하는 MPA 설정
├── src/
│   ├── data/
│   │   └── artworks.ts          # 아트워크 메타데이터 카탈로그 (제목, 설명, 태그 등)
│   ├── components/
│   │   └── viewer-shell.ts      # 개별 아트워크 페이지 공통 뷰어 (로비 복귀, 도슨트 명판, 컨트롤러)
│   ├── main.ts                  # 루트 갤러리 로직 & 실시간 미니 프리뷰 캔버스
│   └── style.css                # 박물관 테마 & 뷰어 공통 스타일
└── artworks/
    ├── celestial-waves/         # 천구의 파동 (Celestial Waves)
    │   ├── index.html           # -> /artworks/celestial-waves/ 로 접근
    │   └── main.ts
    ├── chromatic-prism/         # 빛의 프리즘 (Chromatic Prism)
    │   ├── index.html           # -> /artworks/chromatic-prism/ 로 접근
    │   └── main.ts
    └── neural-flow/             # 신경망의 흐름 (Neural Flow)
        ├── index.html           # -> /artworks/neural-flow/ 로 접근
        └── main.ts
```

---

## 🚀 실행 및 빌드

### 개발 서버 실행
```bash
npm run dev
```
- 메인 로비: `http://localhost:5173/`
- 개별 아트워크: `http://localhost:5173/artworks/[artwork-name]/`

### 프로덕션 빌드
```bash
npm run build
```
Vite가 `artworks/` 폴더 내의 모든 하위 디렉토리를 자동으로 스캔하여 각 아트워크 페이지를 독립된 정적 HTML/JS 청크로 번들링합니다.

---

## 🎨 새로운 아트워크 추가하는 방법

새로운 작품을 추가할 때는 다음 두 단계만 진행하면 됩니다:

### 1. `artworks/[new-artwork-name]/` 디렉토리 생성
- `artworks/[new-artwork-name]/index.html` 생성:
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>새로운 작품명</title>
  </head>
  <body>
    <main class="canvas-stage">
      <canvas id="artworkCanvas"></canvas>
    </main>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- `artworks/[new-artwork-name]/main.ts` 생성:
```ts
import { setupArtworkViewer } from '../../src/components/viewer-shell.ts';

// 공통 도슨트 명판 및 뒤로가기 버튼 세팅
setupArtworkViewer('new-artwork-name', {
  interactionHint: '인터랙션 안내 문구',
});

// 여러분의 캔버스 / WebGL / Three.js 아트워크 코드 작성
```

### 2. `src/data/artworks.ts`에 작품 정보 등록
`ARTWORKS` 배열에 작품의 `slug`, 제목, 도슨트 설명, 태그 등을 추가하면 메인 페이지에 자동으로 전시 카드가 생성됩니다.

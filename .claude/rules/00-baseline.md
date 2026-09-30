---
paths:
  - "src/**/*.ts"
  - "package.json"
  - "tsconfig.json"
---

# 봇 개발 기본 규칙

- 과잉 구현을 막기 위해 `ponytail` 스킬을 활용한다.
- 명세에 없는 슬래시 커맨드, 서브커맨드, 옵션, 사용자 설정은 추가하지 않는다.
- 소스는 `src/`의 TypeScript로 작성하고 ESM(`import`/`export`)을 사용한다. `require`, `module.exports`, `__dirname`은 사용하지 않는다.
- Node 내장 모듈은 `node:` 접두사로 가져온다(`node:path`, `node:fs`). 경로 기준이 필요하면 `import.meta.dirname`을 사용한다.
- 상대 경로 import에는 빌드 결과물 기준 확장자 `.js`를 붙인다(`import { x } from './timer.js'`). `moduleResolution: NodeNext`의 요구사항이다.
- 타입만 가져올 때는 `import type` 또는 `type` 수식어를 사용한다(`verbatimModuleSyntax`).
- `dist/`는 빌드 결과물이므로 직접 수정하지 않는다.
- 들여쓰기, 따옴표, 세미콜론 등 코드 스타일은 주변 코드와 맞춘다. 현재 코드는 4칸 들여쓰기, 작은따옴표, 세미콜론을 사용한다.
- 사용자에게 보이는 메시지는 한국어로 작성하고 기존 응답의 어조와 이모지 사용 방식을 따른다.
- 요청 범위와 관계없는 코드 정리나 리팩터링을 함께 수행하지 않는다.

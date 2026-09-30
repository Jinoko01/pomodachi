---
paths:
  - "package.json"
  - "pnpm-lock.yaml"
  - "pnpm-workspace.yaml"
  - "tsconfig.json"
  - "src/**/*.test.ts"
  - "src/**/*.spec.ts"
  - "tests/**/*.ts"
---

# 의존성, 실행 및 테스트

## 의존성

- 패키지 작업은 `pnpm`으로만 수행한다. `npm`, `yarn`으로 설치하거나 `package-lock.json`을 만들지 않는다.
- lockfile(`pnpm-lock.yaml`)을 직접 수정하지 않는다.
- 이미 설치된 라이브러리로 해결 가능한 문제에 동일한 목적의 새 라이브러리를 추가하지 않는다.
- 새로운 패키지 설치, 기존 패키지 제거, 주요 버전 변경 전에는 확인을 요청한다.
- 타입 정의가 필요한 패키지는 `@types/*`를 devDependency로 추가한다. `@types/node`의 주 버전은 사용하는 Node.js 주 버전에 맞춘다.
- pnpm은 허용되지 않은 패키지의 설치 스크립트를 실행하지 않는다. 설치 스크립트가 필요한 패키지는 `pnpm-workspace.yaml`의 `allowBuilds`에 등록하고, 추가 전에 확인을 요청한다.
- `ffmpeg-static`은 설치 스크립트로 ffmpeg 바이너리를 내려받으므로 `allowBuilds`에서 제외하면 오디오 재생이 동작하지 않는다.
- `discord.js`와 `@discordjs/voice`의 버전을 올릴 때는 Breaking Change, deprecated API, 음성 관련 의존성 호환성을 확인한다.

## 실행

- `pnpm dev`는 `tsx watch`로 `src/index.ts`를 직접 실행하고, `pnpm start`는 `pnpm build`로 만든 `dist/index.js`를 실행한다.
- 봇을 실행하면 실제 Discord에 로그인하고 전역 슬래시 커맨드를 다시 등록한다. 실행 전에 반드시 사용자 확인을 요청한다.
- 음성 관련 의존성 상태는 `@discordjs/voice`의 `generateDependencyReport()`로 Discord 로그인 없이 확인할 수 있다.

## 테스트와 검증

- 코드 변경 후 `pnpm typecheck`와 `pnpm build`를 실행한다.
- 현재 테스트 프레임워크와 lint 설정이 없다. 승인 없이 테스트 프레임워크나 린터를 설치하지 않는다.
- 실제 Discord 연결이 필요한 동작(커맨드 응답, 음성 재생, 타이머 전환)은 봇을 실행하지 않았다면 검증했다고 보고하지 않는다. 확인이 필요한 시나리오를 목록으로 남긴다.
- 테스트 환경을 도입한 뒤에는 Discord API와 음성 연결을 모킹해 타이머 전환, 중복 실행 방지, 자원 정리처럼 사용자가 체감하는 동작을 우선 검증한다.
- 테스트 통과를 목적으로 기존 테스트를 삭제하거나 검증 수준을 낮추지 않는다.
- 검증 명령을 실행하지 못한 경우 실행한 것처럼 보고하지 않는다.

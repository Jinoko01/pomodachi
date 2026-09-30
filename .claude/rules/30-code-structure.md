---
paths:
  - "src/**/*.ts"
  - "tsconfig.json"
---

# TypeScript, 코드 구조와 상태 관리

## TypeScript

- `tsconfig.json`의 `strict`, `noUncheckedIndexedAccess` 설정을 기준으로 타입 오류 없이 작성한다.
- 명시적인 사유 없이 `any`, `@ts-ignore`, `@ts-expect-error`, non-null assertion(`!`), 타입 단언(`as`)으로 오류를 숨기지 않는다.
- discord.js 값은 제공되는 타입 가드로 좁힌다. 예: 길드 멤버·음성 채널이 필요하면 `interaction.inCachedGuild()`로 확인한다.
- 필수 옵션은 `getString('이름', true)`처럼 `required` 인자를 넘겨 `null`이 아닌 타입으로 받는다.
- 환경 변수처럼 외부에서 들어오는 값은 `string | undefined`로 다루고 사용 전에 존재 여부를 검사한다.
- 여러 곳에서 쓰는 상태 구조(`TimerData`, `AudioSettings` 등)는 `interface`로 정의하고 Map·변수에 타입 인자로 명시한다.
- 가능한 값이 제한된 경우 임의의 `string`보다 유니온 타입을 우선한다.
- 함수 반환 타입과 매개변수 타입은 추론이 명확하지 않은 경계에서 명시한다.
- TypeScript 컴파일 옵션을 완화해 오류를 없애지 않는다.

## 파일 구조

- `src/`는 역할별로 나뉜다. 빌드 진입점은 `dist/index.js`다.
  - `index.ts`: 진입점. 환경 변수 검사, 클라이언트 생성, 커맨드 등록, 이벤트 연결, 인터랙션 예외 처리
  - `commands.ts`: 슬래시 커맨드 정의(`commands`)
  - `interactions.ts`: 인터랙션 분기(`handleInteraction`)와 서브커맨드별 핸들러, 자동완성, 도움말 문구
  - `timer.ts`: `TimerData`, `activeTimers`, 타이머 시작(`startTimer`)·정리(`stopTimer`), 음성 연결 감시
  - `audio.ts`: 오디오 폴더 경로, 파일 목록·검증, `AudioSettings`, `userAudioSettings`
- 의존 방향은 `index → commands, interactions`, `interactions → timer, audio`, `timer → audio`로 유지한다. 반대 방향 import를 추가하지 않는다.
- `src/` 파일은 `dist/`에 같은 깊이로 빌드되며, 오디오 폴더는 `import.meta.dirname` 한 단계 위(프로젝트 루트)를 기준으로 찾는다. 파일 위치를 바꾸면 이 경로 계산도 함께 확인한다.
- 기능 추가를 위해 파일을 나누거나 `src/commands/` 같은 새 디렉토리 구조를 도입하려면 먼저 확인을 요청한다.
- 파일을 나눌 때는 순환 참조를 만들지 않고, 기존 동작과 사용자에게 보이는 응답을 바꾸지 않는다.

## 상태 관리

- 진행 중인 타이머는 `activeTimers`(`timer.ts`), 사용자 오디오 설정은 `userAudioSettings`(`audio.ts`) Map에 사용자 ID를 키로 저장한다. 같은 데이터를 다른 곳에 중복 저장하지 않는다.
- 사용자 오디오 설정은 `getAudioSettings`로 읽어 기본값 적용을 한 곳에서 처리한다.
- 두 Map은 메모리에만 존재해 봇을 재시작하면 초기화된다. 파일·DB 등 영속 저장소 도입은 명세에 없으면 추가하지 않는다. 영속 저장소는 통계 기능 작업에서 함께 설계하기로 했다.
- 사용자 설정 기본값(`{ bgmName: null, notifyName: '기본알림음.mp3' }`)은 `getAudioSettings`에만 둔다. 여러 곳에서 반복되는 값을 바꿀 때는 모든 사용처를 함께 수정한다.
- 기존 값에서 계산할 수 있는 값은 별도 상태로 저장하지 않는다.

## 함수와 분기

- 서브커맨드별 처리는 기존처럼 `subcommand` 값으로 분기하고 처리 후 조기 반환한다.
- 한 번만 쓰는 작은 로직은 사용하는 곳 가까이에 두고, 같은 코드가 보인다는 이유만으로 성급하게 추상화하지 않는다.
- 시간 값은 분 단위 입력을 밀리초로 변환하는 기존 방식을 따르고, 변환 위치를 여러 곳으로 흩뜨리지 않는다.

## 주석

- 주석 밀도는 주변 코드에 맞춘다. 현재 코드는 구획 구분 주석과 서브커맨드별 짧은 설명 주석을 사용한다.
- 임시 코드, 비활성화된 코드, 코드만으로 명확한 내용을 설명하는 주석을 남기지 않는다.

# 🍅 Pomodoro Discord Bot

<img width="3168" height="1344" alt="Gemini_Generated_Image_fecciefecciefecc" src="https://github.com/user-attachments/assets/16f86ab8-a1cf-428f-8e9e-ee038e0db3d8" />

## 1. 프로젝트 개요
디스코드 음성 채널 기반의 **뽀모도로(Pomodoro) 타이머 봇**입니다.
이 봇은 디스코드 채널에 상주하며 사용자가 설정한 집중 시간과 휴식 시간에 맞춰 알림을 제공하고, 집중력을 높여줄 수 있는 배경 음악을 재생합니다.

주요 특징:
- 디스코드 **슬래시 커맨드(`/명령어`)**를 통한 간편한 UI 상호작용
- 음성 채널에 자동으로 접속하여 지정된 시간에 **알림음** 재생
- 집중하는 동안 반복 재생할 **배경 음악(BGM)** 설정 지원

---

## 2. 명령어 사용법
봇의 모든 기능은 디스코드 채팅창에서 `/뽀모도로`를 입력하여 나타나는 슬래시 커맨드 메뉴를 통해 사용할 수 있습니다.

| 명령어 | 설명 | 옵션 / 사용 예시 |
|--------|------|-------------------|
| `/뽀모도로 시작` | 뽀모도로 타이머를 시작합니다. | `[집중시간]` (1~180분, 기본 25분), `[휴식시간]` (1~180분, 기본 5분) <br> 예: `/뽀모도로 시작 집중시간: 50 휴식시간: 10` |
| `/뽀모도로 배경음` | 집중 시간에 재생할 배경음을 설정합니다. | `[파일명]` (background-sound 폴더 내 파일, 입력 시 자동완성). <br>무음 설정 시 `없음` 또는 `무음` 기입 |
| `/뽀모도로 알림음` | 타이머 전환 시 재생할 알림음을 설정합니다. | `[파일명]` (notify-sound 폴더 내 파일, 입력 시 자동완성) <br>기본값: `기본알림음.mp3` |
| `/뽀모도로 목록` | 봇에서 사용 가능한 음악 및 알림음 파일 목록을 조회합니다. | - |
| `/뽀모도로 중지` | 진행 중인 타이머를 즉시 중지하고 봇을 내보냅니다. | - |
| `/뽀모도로 도움말` | 봇의 사용 방법 안내문을 채팅창에 출력합니다. | - |

> 💡 **참고**: 배경음과 알림음 설정은 유저 단위로 저장되어 매번 새로 설정할 필요 없이 다음 타이머에도 유지됩니다. 폴더에 없는 파일명은 설정되지 않습니다. 설정은 봇이 재시작되면 초기화됩니다.

> ⚠️ **한 서버에서는 한 사람의 타이머만 진행할 수 있습니다.** 봇은 서버당 하나의 음성 채널에만 접속할 수 있기 때문입니다. 다른 사람의 타이머가 끝난 뒤 시작해 주세요.

---

## 3. 기술 스택
- **Runtime**: [Node.js](https://nodejs.org/) 20.11 이상
- **Language**: [TypeScript](https://www.typescriptlang.org/) (ESM, `tsc` 빌드 / `tsx` 개발 실행)
- **Package Manager**: [pnpm](https://pnpm.io/)
- **Library**: [Discord.js (v14)](https://discord.js.org/)
- **Voice System**: `@discordjs/voice`, `libsodium-wrappers`, `@snazzah/davey`, `ffmpeg-static`
- **Configuration**: `dotenv` (환경 변수 및 토큰 관리)

---

## 4. 실행 방법
1. 의존성을 설치합니다. `ffmpeg-static`의 설치 스크립트가 ffmpeg 바이너리를 함께 내려받습니다.
   ```bash
   pnpm install
   ```
2. 프로젝트 루트에 `.env` 파일을 만들고 봇 토큰을 입력합니다.
   ```text
   DISCORD_TOKEN=발급받은_봇_토큰
   ```
3. 봇을 실행합니다.

| 명령어 | 설명 |
|--------|------|
| `pnpm dev` | 개발용 실행. 소스 파일이 바뀌면 자동으로 다시 시작합니다. |
| `pnpm build` | `src/`를 `dist/`로 빌드합니다. |
| `pnpm start` | 빌드된 `dist/index.js`를 실행합니다. (`pnpm build` 후 사용) |
| `pnpm typecheck` | 빌드 없이 타입 검사만 수행합니다. |

---

## 5. 프로젝트 구조
```text
pomodoro-bot/
├── src/
│   ├── index.ts           # 진입점 (클라이언트 생성, 슬래시 커맨드 등록, 이벤트 연결)
│   ├── commands.ts        # 슬래시 커맨드 정의
│   ├── interactions.ts    # 서브커맨드별 처리와 자동완성
│   ├── timer.ts           # 타이머 시작·정리와 음성 연결 관리
│   └── audio.ts           # 오디오 폴더·파일 검증과 사용자 오디오 설정
├── dist/                  # 빌드 결과물 (pnpm build로 생성, Git 추적 제외)
├── .env                   # 디스코드 봇 토큰 등 환경 변수 파일 (코드에 포함되지 않음)
├── .gitignore             # Git 추적 예외 목록
├── package.json           # 프로젝트 설정, 스크립트 및 종속성 관리 파일
├── pnpm-lock.yaml         # 정확한 의존성 버전 잠금 파일
├── pnpm-workspace.yaml    # pnpm 설정 (설치 스크립트 허용 목록)
├── tsconfig.json          # TypeScript 컴파일 설정
├── background-sound/      # 집중 시간 동안 반복 재생할 BGM 파일 보관용 폴더
│   ├── Moonlight_ 월광_국악.mp3
│   └── 녹턴 작품번호 9-2_국악.mp3
└── notify-sound/          # 집중/휴식 시간이 끝날 때 단발성으로 울릴 알림음 파일 보관용 폴더
    ├── 기본알림음.mp3       # 기본 설정 알림음 파일
    └── 자명종소리.mp3
```

### 오디오 추가 방법
새로운 배경음이나 알림음을 봇에 추가하려면 폴더 구조에 알맞게 `.mp3` 확장자 파일을 넣기만 하면 됩니다.
- 🎵 배경 음악 추가 $\rightarrow$ `background-sound/` 폴더 내 
- 🔔 짧은 알람 추가 $\rightarrow$ `notify-sound/` 폴더 내

이후 디스코드에서 `/뽀모도로 목록` 명령어를 실행하면 봇이 즉시 새로운 파일을 인식하여 목록에 표시해 줍니다.

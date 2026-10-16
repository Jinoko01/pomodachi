# 오디오 설정 영속 저장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/뽀모도로 배경음`·`/뽀모도로 알림음` 설정을 `data/settings.json`에 저장해 봇을 재시작해도 유지되게 한다.

**Architecture:** `src/audio.ts`가 import될 때 JSON 파일을 동기로 읽어 기존 `userAudioSettings` Map을 채우고, `saveAudioSettings()`가 Map 전체를 임시 파일에 쓴 뒤 `rename`으로 교체한다. `src/interactions.ts`의 두 설정 핸들러가 Map 변경 직후 저장을 호출하고, 실패하면 응답 끝에 경고 문구를 붙인다.

**Tech Stack:** Node.js 20.11+, TypeScript(ESM, strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), `node:fs`, `node:path`, discord.js v14. 새 패키지 없음.

**Spec:** `docs/superpowers/specs/2026-10-16-settings-persistence-design.md`

## Global Constraints

- 새 패키지 설치, 새 `src/` 파일, 새 커맨드·옵션을 추가하지 않는다.
- `any`, `@ts-ignore`, non-null assertion(`!`), 타입 단언(`as`)을 쓰지 않는다. JSON 값은 `unknown`으로 받아 타입 가드로 좁힌다.
- 4칸 들여쓰기, 작은따옴표, 세미콜론. 상대 import는 `.js` 확장자. 내장 모듈은 `node:` 접두사.
- 로그는 `console.log`/`console.warn`/`console.error`와 이모지 접두어(✅, ⚠️, ❌). 토큰·인터랙션 객체는 출력하지 않는다.
- 저장 실패 문구(정확히): `⚠️ 설정을 파일에 저장하지 못해 봇을 재시작하면 초기화됩니다.`
- 파일 형식: `{ "version": 1, "users": { "<userId>": { "bgmName": string | null, "notifyName": string } } }`
- 봇 실행(`pnpm dev`, `pnpm start`)은 실제 Discord에 로그인하므로 사용자 승인 없이 하지 않는다. `src/audio.ts`만 import하는 검증 스크립트는 Discord에 접속하지 않으므로 실행해도 된다.
- 테스트 프레임워크가 없고 승인 없이 설치하지 않는다. 대신 각 태스크에서 임시 검증 스크립트(`verify-settings.ts`, 커밋하지 않음)와 `pnpm typecheck`/`pnpm build`로 확인한다.

### 설계 문서와 다른 점 (의도적)

- 설계 3절은 "`data/`가 없으면 `audio.ts` 로드 시 만든다"고 했지만, 모듈 최상위의 `mkdirSync`가 실패하면 봇 시작 자체가 죽는다(설계 4.1.5의 "봇 시작은 막지 않는다"와 충돌). 그래서 `data/` 생성은 `saveAudioSettings()` 안에서 `recursive: true`로 한다. 저장 시점에 폴더가 만들어지므로 설계 6절 시나리오 2는 그대로 성립한다. Task 3에서 설계 문서 문구도 맞춘다.

---

## File Structure

| 파일 | 책임 | 태스크 |
|------|------|--------|
| `src/audio.ts` | 설정 파일 경로 상수, 불러오기(모듈 로드 시), `saveAudioSettings` | Task 1 |
| `src/interactions.ts` | 설정 핸들러에서 저장 호출, 실패 문구 | Task 2 |
| `.gitignore` | `data/` 제외 | Task 2 |
| `README.md`, `docs/spec.md`, `.agents/rules/30-code-structure.md`, `.claude/rules/30-code-structure.md`, 설계 문서 | 문서 갱신 | Task 3 |

---

### Task 1: `audio.ts`에 설정 불러오기·저장 추가

**Files:**
- Modify: `src/audio.ts` (경로 상수 아래와 `userAudioSettings` 선언 아래)
- Test (임시, 커밋하지 않음): `verify-settings.ts` (프로젝트 루트)

**Interfaces:**
- Consumes: 기존 `AudioSettings`, `userAudioSettings: Map<string, AudioSettings>`, `ROOT_DIR`
- Produces: `export function saveAudioSettings(): boolean` — 저장 성공 시 `true`, 실패 시 오류 로그 후 `false`(예외를 던지지 않음). 모듈 import 시 `data/settings.json`의 내용이 `userAudioSettings`에 들어 있다.

- [ ] **Step 1: 검증 스크립트 작성**

프로젝트 루트에 `verify-settings.ts`를 만든다. `tsconfig.json`의 `include`가 `src`뿐이라 빌드에 포함되지 않는다. 모듈은 프로세스당 한 번만 로드되므로 시나리오마다 새 프로세스로 실행한다.

```ts
import { userAudioSettings, getAudioSettings, saveAudioSettings } from './src/audio.js';

const mode = process.argv[2];

if (mode === 'save') {
    userAudioSettings.set('111', { bgmName: '녹턴 작품번호 9-2_국악.mp3', notifyName: '자명종소리.mp3' });
    console.log('saved:', saveAudioSettings());
} else {
    console.log('size:', userAudioSettings.size);
    console.log('111:', JSON.stringify(getAudioSettings('111')));
}
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec tsx verify-settings.ts save`
Expected: FAIL — `saveAudioSettings`가 export되지 않았다는 오류(`does not provide an export named 'saveAudioSettings'`).

- [ ] **Step 3: 구현**

`src/audio.ts`에서 `NOTIFY_DIR` 선언 바로 아래에 경로 상수를 추가한다.

```ts
const DATA_DIR = path.join(ROOT_DIR, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SETTINGS_TMP_FILE = `${SETTINGS_FILE}.tmp`;
const SETTINGS_BROKEN_FILE = `${SETTINGS_FILE}.broken`;
const SETTINGS_VERSION = 1;
```

기존 `userAudioSettings` 선언과 `getAudioSettings` 사이를 다음처럼 바꾼다(기존 두 줄 `// 유저별 오디오 설정 저장 Map`, `export const userAudioSettings ...`는 그대로 두고 그 아래에 추가).

```ts
// 유저별 오디오 설정 저장 Map
export const userAudioSettings = new Map<string, AudioSettings>();

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAudioSettings(value: unknown): value is AudioSettings {
    return isRecord(value)
        && (typeof value.bgmName === 'string' || value.bgmName === null)
        && typeof value.notifyName === 'string';
}

// 손상된 파일을 다음 저장이 덮어쓰지 않도록 옆으로 옮겨 둔다.
function moveBrokenSettingsFile(): void {
    console.error('❌ 설정 파일을 읽을 수 없어 빈 설정으로 시작합니다. 원본은 data/settings.json.broken으로 옮겼습니다.');
    try {
        fs.renameSync(SETTINGS_FILE, SETTINGS_BROKEN_FILE);
    } catch (error) {
        console.error('❌ 손상된 설정 파일을 옮기지 못했습니다:', error);
    }
}

// 봇 시작 시 한 번 data/settings.json을 읽어 userAudioSettings를 채운다. 실패해도 봇 시작은 막지 않는다.
function loadAudioSettings(): void {
    if (!fs.existsSync(SETTINGS_FILE)) return;

    let data: unknown;
    try {
        data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    } catch (error) {
        if (error instanceof SyntaxError) return moveBrokenSettingsFile();
        console.error('❌ 설정 파일을 읽는 중 오류가 발생해 빈 설정으로 시작합니다:', error);
        return;
    }

    if (!isRecord(data) || data.version !== SETTINGS_VERSION || !isRecord(data.users)) {
        return moveBrokenSettingsFile();
    }

    for (const [userId, settings] of Object.entries(data.users)) {
        if (!isAudioSettings(settings)) {
            console.warn(`⚠️ 사용자 ${userId}의 저장된 오디오 설정 형식이 올바르지 않아 건너뜁니다.`);
            continue;
        }
        userAudioSettings.set(userId, { bgmName: settings.bgmName, notifyName: settings.notifyName });
    }
}

loadAudioSettings();

// 임시 파일에 쓴 뒤 교체해 쓰는 도중 종료되어도 기존 파일이 깨지지 않게 한다.
export function saveAudioSettings(): boolean {
    const data = { version: SETTINGS_VERSION, users: Object.fromEntries(userAudioSettings) };
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(SETTINGS_TMP_FILE, JSON.stringify(data, null, 2));
        fs.renameSync(SETTINGS_TMP_FILE, SETTINGS_FILE);
        return true;
    } catch (error) {
        console.error('❌ 오디오 설정 저장 오류:', error);
        return false;
    }
}
```

참고: `isAudioSettings`로 통과한 값도 다른 필드를 더 가질 수 있으므로 Map에는 두 필드만 복사해 넣는다.

- [ ] **Step 4: 시나리오별 확인**

시작 전 `data/`가 없는지 확인한다(이 기능 이전에는 존재하지 않는다). 있다면 내용을 확인하고 다른 곳에 백업한 뒤 진행한다.

1. 저장 후 다시 불러오기
   - Run: `pnpm exec tsx verify-settings.ts save` → Expected: `saved: true`, `data/settings.json` 생성
   - Run: `pnpm exec tsx verify-settings.ts` → Expected: `size: 1`, `111: {"bgmName":"녹턴 작품번호 9-2_국악.mp3","notifyName":"자명종소리.mp3"}`
2. 손상된 JSON
   - `data/settings.json` 내용을 `{oops`로 바꾼다.
   - Run: `pnpm exec tsx verify-settings.ts` → Expected: `❌ 설정 파일을 읽을 수 없어 ...` 로그, `size: 0`, `111: {"bgmName":null,"notifyName":"기본알림음.mp3"}`, `data/settings.json.broken` 존재, `data/settings.json` 없음
3. 형식이 틀린 항목 건너뛰기
   - `data/settings.json`을 다음 내용으로 만든다.
     ```json
     { "version": 1, "users": { "111": { "bgmName": null, "notifyName": "자명종소리.mp3" }, "222": { "bgmName": 3 } } }
     ```
   - Run: `pnpm exec tsx verify-settings.ts` → Expected: `⚠️ 사용자 222의 ...` 로그, `size: 1`, `111: {"bgmName":null,"notifyName":"자명종소리.mp3"}`
4. 저장 실패
   - `data/settings.json`을 지우고 같은 이름의 **폴더**를 만든다(`data/settings.json/`).
   - Run: `pnpm exec tsx verify-settings.ts save` → Expected: 읽기 오류 로그(`EISDIR`), `❌ 오디오 설정 저장 오류:` 로그, `saved: false`. 프로세스는 예외 없이 끝난다.
5. 정리: `data/` 폴더 전체와 `verify-settings.ts`를 지운다(둘 다 이 태스크에서 만든 것).

- [ ] **Step 5: 타입 검사**

Run: `pnpm typecheck`
Expected: 오류 없이 종료

- [ ] **Step 6: 커밋**

```bash
git add src/audio.ts
git commit -m "feat: 오디오 설정을 data/settings.json에 저장하고 시작 시 불러오기"
```

---

### Task 2: 설정 핸들러에서 저장 호출과 `.gitignore`

**Files:**
- Modify: `src/interactions.ts:3` (import), `handleBgm`·`handleNotify` 함수(현재 약 107~137행)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Task 1의 `saveAudioSettings(): boolean`
- Produces: 없음

- [ ] **Step 1: import 수정**

`src/interactions.ts` 3행을 다음으로 바꾼다.

```ts
import { BGM_DIR, NOTIFY_DIR, userAudioSettings, getAudioSettings, saveAudioSettings, listAudioFiles, isAvailableAudioFile } from './audio.js';
```

- [ ] **Step 2: 실패 문구 상수 추가**

`HELP_MESSAGE` 상수 정의가 끝난 바로 다음 줄에 추가한다.

```ts
const SAVE_FAILED_NOTICE = '\n⚠️ 설정을 파일에 저장하지 못해 봇을 재시작하면 초기화됩니다.';
```

- [ ] **Step 3: `handleBgm` 수정**

다음 부분을

```ts
    const userSettings = getAudioSettings(interaction.user.id);
    userSettings.bgmName = bgmName;
    userAudioSettings.set(interaction.user.id, userSettings);

    return interaction.reply({
        content: `🎵 배경음이 **${bgmName ? bgmName : '없음(무음)'}**(으)로 설정되었습니다!`,
        allowedMentions: { parse: [] }
    });
```

다음으로 바꾼다.

```ts
    const userSettings = getAudioSettings(interaction.user.id);
    userSettings.bgmName = bgmName;
    userAudioSettings.set(interaction.user.id, userSettings);
    const saved = saveAudioSettings();

    return interaction.reply({
        content: `🎵 배경음이 **${bgmName ? bgmName : '없음(무음)'}**(으)로 설정되었습니다!${saved ? '' : SAVE_FAILED_NOTICE}`,
        allowedMentions: { parse: [] }
    });
```

- [ ] **Step 4: `handleNotify` 수정**

다음 부분을

```ts
    const userSettings = getAudioSettings(interaction.user.id);
    userSettings.notifyName = notifyName;
    userAudioSettings.set(interaction.user.id, userSettings);

    return interaction.reply({
        content: `🔔 알림음이 **${notifyName}**(으)로 설정되었습니다!`,
        allowedMentions: { parse: [] }
    });
```

다음으로 바꾼다.

```ts
    const userSettings = getAudioSettings(interaction.user.id);
    userSettings.notifyName = notifyName;
    userAudioSettings.set(interaction.user.id, userSettings);
    const saved = saveAudioSettings();

    return interaction.reply({
        content: `🔔 알림음이 **${notifyName}**(으)로 설정되었습니다!${saved ? '' : SAVE_FAILED_NOTICE}`,
        allowedMentions: { parse: [] }
    });
```

- [ ] **Step 5: `.gitignore`에 `data/` 추가**

`.gitignore`는 다음 내용이 된다.

```text
node_modules/
.env
dist/
data/
```

- [ ] **Step 6: 타입 검사와 빌드**

Run: `pnpm typecheck` → Expected: 오류 없음
Run: `pnpm build` → Expected: 오류 없음, `dist/audio.js`에 `saveAudioSettings` 포함
Run: `git status --short` → Expected: `src/interactions.ts`, `.gitignore`만 변경(`dist/`, `data/`는 표시되지 않음)

- [ ] **Step 7: 커밋**

```bash
git add src/interactions.ts .gitignore
git commit -m "feat: 배경음·알림음 설정 시 파일에 저장하고 실패하면 경고"
```

---

### Task 3: 문서 갱신

**Files:**
- Modify: `README.md:28`, `README.md` 프로젝트 구조 블록
- Modify: `docs/spec.md` §5(약 160~167행), §7(약 185행)
- Modify: `.agents/rules/30-code-structure.md`, `.claude/rules/30-code-structure.md` (두 파일은 현재 동일하며 같은 내용으로 유지)
- Modify: `docs/superpowers/specs/2026-10-16-settings-persistence-design.md` 3절

**Interfaces:**
- Consumes: Task 1·2의 동작
- Produces: 없음

- [ ] **Step 1: README 참고 문구**

28행의 마지막 문장 `설정은 봇이 재시작되면 초기화됩니다.`를 다음으로 바꾼다.

```text
설정은 `data/settings.json`에 저장되어 봇을 재시작해도 유지됩니다.
```

- [ ] **Step 2: README 프로젝트 구조**

`├── dist/ ...` 줄 바로 아래에 다음 줄을 추가한다.

```text
├── data/                  # 사용자 오디오 설정 저장 파일(settings.json, 실행 시 생성, Git 추적 제외)
```

같은 블록의 `audio.ts` 주석을 `# 오디오 폴더·파일 검증과 사용자 오디오 설정 저장·불러오기`로 바꾼다.

- [ ] **Step 3: `docs/spec.md` §5**

표의 `userAudioSettings` 행에서 생성 칸을 `봇 시작 시 data/settings.json에서 불러옴, 배경음·알림음 설정 시`로 바꾼다.

`- 두 Map 모두 메모리에만 존재하므로 ...` 줄을 다음 두 줄로 바꾼다.

```markdown
- `activeTimers`는 메모리에만 존재하므로 봇을 재시작하면 진행 중인 타이머는 사라진다.
- `userAudioSettings`는 설정이 바뀔 때마다 `data/settings.json`(`{ version: 1, users: { [userId]: AudioSettings } }`)에 저장되고 봇 시작 시 불러온다. 파일이 손상되면 `settings.json.broken`으로 옮기고 빈 설정으로 시작하며, 저장에 실패하면 설정 응답 끝에 `⚠️ 설정을 파일에 저장하지 못해 봇을 재시작하면 초기화됩니다.`를 붙인다.
```

`- 설정은 봇이 실행 중인 동안 길드와 관계없이 사용자 단위로 유지된다.` 줄을 `- 설정은 길드와 관계없이 사용자 단위로 유지된다.`로 바꾼다.

§3.3, §3.4의 응답 줄 뒤에 각각 다음을 추가한다.

```markdown
- 설정을 `data/settings.json`에 저장하지 못하면 응답 끝에 줄을 바꿔 `⚠️ 설정을 파일에 저장하지 못해 봇을 재시작하면 초기화됩니다.`를 붙인다(설정 자체는 이번 실행 동안 적용된다).
```

- [ ] **Step 4: `docs/spec.md` §7**

`- **설정 비영속**: ...` 줄을 삭제하고, `- **실행 검증 필요**: ...` 줄의 확인 목록 끝에 `, 재시작 후 오디오 설정 유지`를 추가한다.

- [ ] **Step 5: 규칙 문서 (두 파일 모두 동일하게)**

파일 구조 절의 `audio.ts` 줄을 다음으로 바꾼다.

```markdown
  - `audio.ts`: 오디오 폴더 경로, 파일 목록·검증, `AudioSettings`, `userAudioSettings`, 설정 파일(`data/settings.json`) 불러오기·저장(`saveAudioSettings`)
```

상태 관리 절의 `- 두 Map은 메모리에만 존재해 ...` 줄을 다음으로 바꾼다.

```markdown
- `activeTimers`는 메모리에만 존재해 봇을 재시작하면 초기화된다. `userAudioSettings`는 `data/settings.json`에 저장하며, 설정을 바꾸는 코드는 Map 변경 직후 `saveAudioSettings()`를 호출한다. 통계 등 다른 데이터의 영속 저장소는 명세에 없으면 추가하지 않으며, 통계 기능 작업에서 함께 설계한다.
```

Run: `diff .agents/rules/30-code-structure.md .claude/rules/30-code-structure.md` → Expected: 차이 없음

- [ ] **Step 6: 설계 문서 3절**

`- `data/`가 없으면 `audio.ts` 로드 시 만든다. `data/`는 `.gitignore`에 추가한다.`를 다음으로 바꾼다.

```markdown
- `data/`는 저장할 때 없으면 만든다(`saveAudioSettings` 안에서 `recursive: true`). 모듈 로드 시 폴더 생성이 실패해 봇 시작이 막히지 않도록 하기 위해서다. `data/`는 `.gitignore`에 추가한다.
```

- [ ] **Step 7: 커밋**

```bash
git add README.md docs/spec.md .agents/rules/30-code-structure.md .claude/rules/30-code-structure.md docs/superpowers/specs/2026-10-16-settings-persistence-design.md
git commit -m "docs: 오디오 설정 영속 저장 반영"
```

---

### Task 4: 최종 검증과 보고

**Files:** 없음

- [ ] **Step 1: 빌드 검증**

Run: `pnpm typecheck` → Expected: 오류 없음
Run: `pnpm build` → Expected: 오류 없음
Run: `git status --short` → Expected: 변경 없음

- [ ] **Step 2: Discord 실행 검증 (사용자 승인 필요)**

봇 실행 승인을 받은 경우에만 진행한다. 승인이 없으면 아래 목록을 "미확인"으로 보고한다.

1. `/뽀모도로 배경음`·`/뽀모도로 알림음` 설정 → 응답에 경고 문구가 없고 `data/settings.json`이 만들어지는지
2. 봇 재시작 → `/뽀모도로 시작` 응답의 `⚙️ 설정` 줄에 저장한 배경음·알림음이 표시되는지
3. 저장 실패 상황(`data/settings.json`을 폴더로 바꾼 상태)에서 설정 → 응답 끝에 `⚠️ 설정을 파일에 저장하지 못해 봇을 재시작하면 초기화됩니다.`가 붙는지

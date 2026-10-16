import path from 'node:path';
import fs from 'node:fs';

export interface AudioSettings {
    bgmName: string | null;
    notifyName: string;
}

// src/와 빌드 결과물 dist/ 모두 프로젝트 루트의 오디오 폴더를 가리키도록 한 단계 위를 기준으로 한다.
const ROOT_DIR = path.join(import.meta.dirname, '..');
export const BGM_DIR = path.join(ROOT_DIR, 'background-sound');
export const NOTIFY_DIR = path.join(ROOT_DIR, 'notify-sound');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SETTINGS_TMP_FILE = `${SETTINGS_FILE}.tmp`;
const SETTINGS_BROKEN_FILE = `${SETTINGS_FILE}.broken`;
const SETTINGS_VERSION = 1;

if (!fs.existsSync(BGM_DIR)) fs.mkdirSync(BGM_DIR);
if (!fs.existsSync(NOTIFY_DIR)) fs.mkdirSync(NOTIFY_DIR);

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

export function getAudioSettings(userId: string): AudioSettings {
    return userAudioSettings.get(userId) || { bgmName: null, notifyName: '기본알림음.mp3' };
}

export function listAudioFiles(dir: string): string[] {
    return fs.readdirSync(dir).filter(f => f.endsWith('.mp3'));
}

// 경로 구분자·상위 경로로 오디오 폴더 밖을 가리키는 입력과 없는 파일은 사용할 수 없다.
export function isAvailableAudioFile(dir: string, fileName: string): boolean {
    return fileName === path.basename(fileName) && fs.existsSync(path.join(dir, fileName));
}

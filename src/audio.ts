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

if (!fs.existsSync(BGM_DIR)) fs.mkdirSync(BGM_DIR);
if (!fs.existsSync(NOTIFY_DIR)) fs.mkdirSync(NOTIFY_DIR);

// 유저별 오디오 설정 저장 Map
export const userAudioSettings = new Map<string, AudioSettings>();

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

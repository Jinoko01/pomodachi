import type { GuildTextBasedChannel, VoiceBasedChannel } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, AudioPlayerStatus, VoiceConnectionStatus, type AudioPlayer, type VoiceConnection } from '@discordjs/voice';
import path from 'node:path';
import fs from 'node:fs';
import { BGM_DIR, NOTIFY_DIR } from './audio.js';

export interface TimerData {
    timeouts: NodeJS.Timeout[];
    connection: VoiceConnection;
    player: AudioPlayer;
    channel: GuildTextBasedChannel | null;
    // 휴식이 끝나 자동 종료를 기다리는 중이면 true. 이 상태에서는 바로 새 타이머를 시작할 수 있다.
    ended: boolean;
}

export interface TimerOptions {
    userId: string;
    voiceChannel: VoiceBasedChannel;
    textChannel: GuildTextBasedChannel | null;
    workTimeMs: number;
    breakTimeMs: number;
    bgmName: string | null;
    notifyName: string;
}

// 현재 타이머가 진행 중인 유저를 추적하기 위한 Map
export const activeTimers = new Map<string, TimerData>();

// 채널 메시지 전송 실패(권한 부족, 채널 삭제 등)가 타이머 흐름을 중단시키지 않도록 로그만 남긴다.
export function sendToChannel(channel: GuildTextBasedChannel | null, content: string): void {
    channel?.send(content).catch(error => console.error('❌ 채널 메시지 전송 오류:', error));
}

// 모든 종료 경로에서 공통으로 사용하는 정리: 상태 삭제 → 예약 해제 → 플레이어 정지 → 음성 연결 해제
// 상태를 먼저 삭제해 음성 연결 Destroyed 이벤트가 의도하지 않은 끊김으로 처리하지 않게 한다.
export function stopTimer(userId: string, timerData: TimerData): void {
    if (activeTimers.get(userId) === timerData) activeTimers.delete(userId);
    timerData.timeouts.forEach(clearTimeout);
    timerData.player.stop();
    if (timerData.connection.state.status !== VoiceConnectionStatus.Destroyed) timerData.connection.destroy();
}

// 음성 연결은 서버(길드)당 하나뿐이므로 같은 서버의 타이머를 [사용자 ID, 타이머] 형태로 찾는다.
export function findGuildTimer(guildId: string): [string, TimerData] | undefined {
    return [...activeTimers.entries()].find(([, timer]) => timer.connection.joinConfig.guildId === guildId);
}

// 음성 채널에 접속해 배경음을 재생하고 집중 종료 → 휴식 종료 → 자동 종료를 예약한다.
export function startTimer({ userId, voiceChannel, textChannel, workTimeMs, breakTimeMs, bgmName, notifyName }: TimerOptions): void {
    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    const player = createAudioPlayer();
    connection.subscribe(player);

    const timerData: TimerData = {
        timeouts: [],
        connection,
        player,
        channel: textChannel,
        ended: false
    };
    activeTimers.set(userId, timerData);

    watchConnection(userId, timerData);

    let isFocusTime = true;

    if (bgmName) {
        const bgmPath = path.join(BGM_DIR, bgmName);
        if (fs.existsSync(bgmPath)) {
            player.play(createAudioResource(bgmPath));

            player.on(AudioPlayerStatus.Idle, () => {
                // 집중 시간일 때만 BGM 무한 반복 재생
                if (isFocusTime && fs.existsSync(bgmPath)) {
                    player.play(createAudioResource(bgmPath));
                }
            });
        } else {
            sendToChannel(timerData.channel, `⚠️ (경고) \`${bgmName}\` 파일을 찾을 수 없어 배경 음악 없이 진행합니다.`);
        }
    }

    const notifyPath = path.join(NOTIFY_DIR, notifyName);

    const workTimeout = setTimeout(() => {
        isFocusTime = false;
        player.stop(); // 루프 중단 (혹은 마지막 1회 재생도 즉시 종료시킴)

        const breakEndTime = Math.floor((Date.now() + breakTimeMs) / 1000);
        sendToChannel(timerData.channel, `🔔 <@${userId}>님, 집중 시간이 지났습니다! 고생하셨어요.\n지금부터 **푹 쉬고 오세요!** ☕ (휴식 종료: <t:${breakEndTime}:R>)`);

        if (fs.existsSync(notifyPath)) {
            player.play(createAudioResource(notifyPath));
        } else {
            sendToChannel(timerData.channel, `⚠️ (경고) \`${notifyName}\` 파일을 찾을 수 없습니다.`);
        }

        const breakTimeout = setTimeout(() => {
            timerData.ended = true;
            sendToChannel(timerData.channel, `⏰ <@${userId}>님, 휴식 시간이 끝났습니다!\n다시 집중할 시간입니다. (다시 시작하려면 \`/뽀모도로 시작\`을 입력하세요)`);

            if (fs.existsSync(notifyPath)) {
                player.play(createAudioResource(notifyPath));
            }

            // 알림음 재생이 끝날 때까지 기다린 뒤 정리한다. 그 전에 새 타이머를 시작하면 시작 시점에 정리된다.
            const endTimeout = setTimeout(() => stopTimer(userId, timerData), 60000);
            timerData.timeouts.push(endTimeout);

        }, breakTimeMs);
        timerData.timeouts.push(breakTimeout);

    }, workTimeMs);
    timerData.timeouts.push(workTimeout);
}

// 플레이어·연결 오류를 기록하고, 연결 실패·끊김으로 타이머가 남지 않도록 정리한다.
function watchConnection(userId: string, timerData: TimerData): void {
    const { connection, player } = timerData;

    player.on('error', error => console.error('❌ 오디오 재생 오류 (/뽀모도로 시작):', error));
    connection.on('error', error => console.error('❌ 음성 연결 오류 (/뽀모도로 시작):', error));

    // 연결이 끊기면 5초 동안 재연결을 기다리고, 재연결되지 않으면 연결을 해제한다.
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
        } catch {
            if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
        }
    });

    // stopTimer를 거치지 않고 연결이 해제됐다면(강제 퇴장, 재연결 실패) 남은 타이머를 정리하고 알린다.
    connection.on(VoiceConnectionStatus.Destroyed, () => {
        if (activeTimers.get(userId) !== timerData) return;
        stopTimer(userId, timerData);
        sendToChannel(timerData.channel, `⚠️ <@${userId}>님, 음성 연결이 끊겨 뽀모도로 타이머를 종료했습니다. 다시 시작하려면 \`/뽀모도로 시작\`을 입력하세요.`);
    });

    entersState(connection, VoiceConnectionStatus.Ready, 20_000).catch(() => {
        if (activeTimers.get(userId) !== timerData) return;
        stopTimer(userId, timerData);
        sendToChannel(timerData.channel, `❌ <@${userId}>님, 음성 채널에 접속하지 못해 뽀모도로 타이머를 종료했습니다. 봇에게 해당 음성 채널의 **연결**·**말하기** 권한이 있는지 확인한 뒤 다시 \`/뽀모도로 시작\`을 입력하세요.`);
    });
}

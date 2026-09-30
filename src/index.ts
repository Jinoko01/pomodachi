import 'dotenv/config';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, type GuildTextBasedChannel, type Interaction } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, AudioPlayerStatus, VoiceConnectionStatus, type AudioPlayer, type VoiceConnection } from '@discordjs/voice';
import path from 'node:path';
import fs from 'node:fs';

interface TimerData {
    timeouts: NodeJS.Timeout[];
    connection: VoiceConnection;
    player: AudioPlayer;
    channel: GuildTextBasedChannel | null;
    // 휴식이 끝나 자동 종료를 기다리는 중이면 true. 이 상태에서는 바로 새 타이머를 시작할 수 있다.
    ended: boolean;
}

interface AudioSettings {
    bgmName: string | null;
    notifyName: string;
}

const token = process.env.DISCORD_TOKEN;
if (!token) {
    throw new Error('DISCORD_TOKEN 환경 변수가 설정되지 않았습니다. .env 파일을 확인하세요.');
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// 현재 타이머가 진행 중인 유저를 추적하기 위한 Map
const activeTimers = new Map<string, TimerData>();

// 유저별 오디오 설정 저장 Map
const userAudioSettings = new Map<string, AudioSettings>();

// src/와 빌드 결과물 dist/ 모두 프로젝트 루트의 오디오 폴더를 가리키도록 한 단계 위를 기준으로 한다.
const ROOT_DIR = path.join(import.meta.dirname, '..');
const BGM_DIR = path.join(ROOT_DIR, 'background-sound');
const NOTIFY_DIR = path.join(ROOT_DIR, 'notify-sound');

if (!fs.existsSync(BGM_DIR)) fs.mkdirSync(BGM_DIR);
if (!fs.existsSync(NOTIFY_DIR)) fs.mkdirSync(NOTIFY_DIR);

// 채널 메시지 전송 실패(권한 부족, 채널 삭제 등)가 타이머 흐름을 중단시키지 않도록 로그만 남긴다.
function sendToChannel(channel: GuildTextBasedChannel | null, content: string): void {
    channel?.send(content).catch(error => console.error('❌ 채널 메시지 전송 오류:', error));
}

// 모든 종료 경로에서 공통으로 사용하는 정리: 상태 삭제 → 예약 해제 → 플레이어 정지 → 음성 연결 해제
// 상태를 먼저 삭제해 음성 연결 Destroyed 이벤트가 의도하지 않은 끊김으로 처리하지 않게 한다.
function stopTimer(userId: string, timerData: TimerData): void {
    if (activeTimers.get(userId) === timerData) activeTimers.delete(userId);
    timerData.timeouts.forEach(clearTimeout);
    timerData.player.stop();
    if (timerData.connection.state.status !== VoiceConnectionStatus.Destroyed) timerData.connection.destroy();
}

// -----------------------------------------------------------------------------------------
// 슬래시 커맨드 정의 (Slash Commands)
// 참고: 슬래시 커맨드 이름에는 띄어쓰기를 사용할 수 없으므로 '/뽀모도로' 커맨드의 서브커맨드로 등록합니다.
// -----------------------------------------------------------------------------------------
const commands = [
    new SlashCommandBuilder()
        .setName('뽀모도로')
        .setDescription('뽀모도로 타이머 명령어 모음')
        .addSubcommand(subcommand =>
            subcommand
                .setName('시작')
                .setDescription('뽀모도로 타이머를 시작합니다.')
                .addIntegerOption(option =>
                    option.setName('집중시간')
                        .setDescription('집중할 시간을 분 단위로 입력하세요 (1~180분, 기본 25분)')
                        .setMinValue(1)
                        .setMaxValue(180)
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('휴식시간')
                        .setDescription('휴식할 시간을 분 단위로 입력하세요 (1~180분, 기본 5분)')
                        .setMinValue(1)
                        .setMaxValue(180)
                        .setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('배경음')
                .setDescription('집중 시간에 재생할 배경음을 설정합니다.')
                .addStringOption(option =>
                    option.setName('파일명')
                        .setDescription('재생할 오디오 파일명 (예: bgm.mp3)')
                        .setAutocomplete(true)
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('알림음')
                .setDescription('휴식/집중 종료 시 재생할 알림음을 설정합니다.')
                .addStringOption(option =>
                    option.setName('파일명')
                        .setDescription('재생할 오디오 파일명 (기본: 기본알림음.mp3)')
                        .setAutocomplete(true)
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('목록')
                .setDescription('사용 가능한 오디오 목록을 확인합니다.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('중지')
                .setDescription('현재 진행 중인 뽀모도로 타이머를 중지합니다.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('도움말')
                .setDescription('뽀모도로 봇 사용법 안내를 출력합니다.')
        )
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

// -----------------------------------------------------------------------------------------
// 봇 로직
// -----------------------------------------------------------------------------------------
client.on('ready', async readyClient => {
    console.log(`✅ ${readyClient.user.tag} 봇이 성공적으로 로그인했습니다!`);

    try {
        console.log('🔄 슬래시 커맨드 업데이트 중...');
        await rest.put(
            Routes.applicationCommands(readyClient.user.id),
            { body: commands }
        );
        console.log('✅ 슬래시 커맨드가 성공적으로 등록되었습니다.');
    } catch (error) {
        console.error('❌ 슬래시 커맨드 등록 오류:', error);
    }
});

client.on('error', error => console.error('❌ 디스코드 클라이언트 오류:', error));

client.on('interactionCreate', async interaction => {
    try {
        await handleInteraction(interaction);
    } catch (error) {
        const commandLabel = interaction.isChatInputCommand() ? `/${interaction.commandName} ${interaction.options.getSubcommand(false) ?? ''}` : interaction.type;
        console.error(`❌ 인터랙션 처리 오류 (${commandLabel}):`, error);

        if (!interaction.isRepliable()) return;
        const content = '❌ 명령을 처리하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
        const response = interaction.replied || interaction.deferred
            ? interaction.followUp({ content, ephemeral: true })
            : interaction.reply({ content, ephemeral: true });
        await response.catch(replyError => console.error('❌ 오류 안내 전송 실패:', replyError));
    }
});

async function handleInteraction(interaction: Interaction): Promise<unknown> {
    // '/뽀모도로 배경음', '/뽀모도로 알림음' 파일명 자동완성
    if (interaction.isAutocomplete()) {
        if (interaction.commandName !== '뽀모도로') return;

        const isBgm = interaction.options.getSubcommand() === '배경음';
        const focused = interaction.options.getFocused().toLowerCase();
        const files = fs.readdirSync(isBgm ? BGM_DIR : NOTIFY_DIR).filter(f => f.endsWith('.mp3'));
        const candidates = isBgm ? ['없음', ...files] : files;

        return interaction.respond(
            candidates
                .filter(f => f.length <= 100 && f.toLowerCase().includes(focused))
                .slice(0, 25)
                .map(f => ({ name: f, value: f }))
        );
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName !== '뽀모도로') return;

    const subcommand = interaction.options.getSubcommand();

    // '/뽀모도로 도움말'
    if (subcommand === '도움말') {
        return interaction.reply({
            content: `🍅 **뽀모도로 봇 사용법 안내** 🍅

🔹 \`/뽀모도로 시작 [집중시간] [휴식시간]\`
타이머를 시작합니다. (1~180분, 옵션을 주지 않으면 기본값인 **집중 25분 / 휴식 5분** 적용)
한 서버에서는 한 사람의 타이머만 진행할 수 있습니다.

🔹 \`/뽀모도로 배경음 [파일명]\`
집중 시간에 반복 재생될 배경음을 설정합니다. (\`background-sound\` 폴더 내 파일 사용, 입력하면 자동완성, 무음은 \`없음\` 또는 \`무음\` 기입)

🔹 \`/뽀모도로 알림음 [파일명]\`
타이머가 끝날 때 재생될 알림음을 설정합니다. (\`notify-sound\` 폴더 내 파일 사용, 입력하면 자동완성, 기본값: \`기본알림음.mp3\`)

🔹 \`/뽀모도로 목록\`
사용 가능한 오디오 파일 목록을 확인합니다.

🔹 \`/뽀모도로 중지\`
진행 중인 타이머를 즉시 중지하고 봇을 내보냅니다.`,
            ephemeral: true
        });
    }

    // '/뽀모도로 목록'
    if (subcommand === '목록') {
        let replyMsg = '🎵 **사용 가능한 오디오 목록:**\n\n';

        replyMsg += '**[배경음 (background-sound)]**\n';
        if (fs.existsSync(BGM_DIR)) {
            const bgmFiles = fs.readdirSync(BGM_DIR).filter(f => f.endsWith('.mp3'));
            replyMsg += bgmFiles.length > 0 ? bgmFiles.map(f => `- \`${f}\``).join('\n') + '\n' : '📂 파일이 없습니다.\n';
        } else {
            replyMsg += '📂 폴더가 없습니다.\n';
        }

        replyMsg += '\n**[알림음 (notify-sound)]**\n';
        if (fs.existsSync(NOTIFY_DIR)) {
            const notifyFiles = fs.readdirSync(NOTIFY_DIR).filter(f => f.endsWith('.mp3'));
            replyMsg += notifyFiles.length > 0 ? notifyFiles.map(f => `- \`${f}\``).join('\n') : '📂 파일이 없습니다.';
        } else {
            replyMsg += '📂 폴더가 없습니다.';
        }

        return interaction.reply({ content: replyMsg, ephemeral: true });
    }

    // '/뽀모도로 중지'
    if (subcommand === '중지') {
        const timerData = activeTimers.get(interaction.user.id);
        if (!timerData) {
            return interaction.reply({ content: '❌ 현재 진행 중인 뽀모도로 타이머가 없습니다.', ephemeral: true });
        }

        stopTimer(interaction.user.id, timerData);
        return interaction.reply('🛑 뽀모도로 타이머를 중지했습니다.');
    }

    // '/뽀모도로 배경음'
    if (subcommand === '배경음') {
        let bgmName: string | null = interaction.options.getString('파일명', true);
        if (bgmName === '없음' || bgmName === '무음') bgmName = null;
        else if (!bgmName.endsWith('.mp3')) bgmName += '.mp3';

        // 경로 구분자·상위 경로로 오디오 폴더 밖을 가리키는 입력과 없는 파일은 저장하지 않는다.
        if (bgmName && (bgmName !== path.basename(bgmName) || !fs.existsSync(path.join(BGM_DIR, bgmName)))) {
            return interaction.reply({
                content: `❌ 배경음 폴더에서 \`${bgmName}\` 파일을 찾을 수 없습니다. \`/뽀모도로 목록\`으로 사용 가능한 파일을 확인해 주세요.`,
                ephemeral: true,
                allowedMentions: { parse: [] }
            });
        }

        const userSettings = userAudioSettings.get(interaction.user.id) || { bgmName: null, notifyName: '기본알림음.mp3' };
        userSettings.bgmName = bgmName;
        userAudioSettings.set(interaction.user.id, userSettings);

        return interaction.reply({
            content: `🎵 배경음이 **${bgmName ? bgmName : '없음(무음)'}**(으)로 설정되었습니다!`,
            allowedMentions: { parse: [] }
        });
    }

    // '/뽀모도로 알림음'
    if (subcommand === '알림음') {
        let notifyName = interaction.options.getString('파일명', true);
        if (!notifyName.endsWith('.mp3')) notifyName += '.mp3';

        // 경로 구분자·상위 경로로 오디오 폴더 밖을 가리키는 입력과 없는 파일은 저장하지 않는다.
        if (notifyName !== path.basename(notifyName) || !fs.existsSync(path.join(NOTIFY_DIR, notifyName))) {
            return interaction.reply({
                content: `❌ 알림음 폴더에서 \`${notifyName}\` 파일을 찾을 수 없습니다. \`/뽀모도로 목록\`으로 사용 가능한 파일을 확인해 주세요.`,
                ephemeral: true,
                allowedMentions: { parse: [] }
            });
        }

        const userSettings = userAudioSettings.get(interaction.user.id) || { bgmName: null, notifyName: '기본알림음.mp3' };
        userSettings.notifyName = notifyName;
        userAudioSettings.set(interaction.user.id, userSettings);

        return interaction.reply({
            content: `🔔 알림음이 **${notifyName}**(으)로 설정되었습니다!`,
            allowedMentions: { parse: [] }
        });
    }

    // '/뽀모도로 시작'
    if (subcommand === '시작') {
        const userId = interaction.user.id;
        const existingTimer = activeTimers.get(userId);
        if (existingTimer && !existingTimer.ended) {
            return interaction.reply({ content: '⏳ 현재 뽀모도로 타이머가 이미 진행 중입니다! (중지하려면 `/뽀모도로 중지`를 입력하세요)', ephemeral: true });
        }

        if (!interaction.inCachedGuild() || !interaction.member.voice.channel) {
            return interaction.reply({ content: '❌ 봇이 알림음을 재생하려면 먼저 음성 채널에 접속해 있어야 합니다.', ephemeral: true });
        }

        // 음성 연결은 서버(길드)당 하나뿐이므로 같은 서버에서는 한 사람의 타이머만 진행한다.
        const guildTimer = [...activeTimers.entries()].find(([, timer]) => timer.connection.joinConfig.guildId === interaction.guildId);
        if (guildTimer && !guildTimer[1].ended) {
            return interaction.reply({
                content: `⚠️ 이 서버에서는 이미 <@${guildTimer[0]}>님의 뽀모도로 타이머가 진행 중입니다. 봇은 한 서버에서 하나의 타이머만 진행할 수 있으니, 해당 타이머가 끝난 뒤 다시 시작해 주세요.`,
                ephemeral: true,
                allowedMentions: { parse: [] }
            });
        }

        // 휴식이 끝나 자동 종료를 기다리던 타이머는 바로 정리하고 새로 시작한다.
        if (existingTimer) stopTimer(userId, existingTimer);
        if (guildTimer) stopTimer(guildTimer[0], guildTimer[1]);

        const voiceChannel = interaction.member.voice.channel;

        const workMins = interaction.options.getInteger('집중시간') || 25;
        const breakMins = interaction.options.getInteger('휴식시간') || 5;

        // 사용자의 오디오 설정 불러오기
        const userSettings = userAudioSettings.get(interaction.user.id) || { bgmName: null, notifyName: '기본알림음.mp3' };
        let bgmName = userSettings.bgmName || null;
        let notifyName = userSettings.notifyName || '기본알림음.mp3';

        const workTimeMs = workMins * 60 * 1000;
        const breakTimeMs = breakMins * 60 * 1000;

        const workEndTime = Math.floor((Date.now() + workTimeMs) / 1000);
        let settingMsg = `⚙️ **설정**: 집중 ${workMins}분 / 휴식 ${breakMins}분`;
        if (bgmName) settingMsg += ` / 배경음: ${bgmName}`;
        settingMsg += ` / 알림음: ${notifyName}`;

        await interaction.reply(`🍅 **뽀모도로 타이머 시작!** 딴짓 금지, 집중해 보세요! (종료: <t:${workEndTime}:R>)\n${settingMsg}`);

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
        });

        const player = createAudioPlayer();
        connection.subscribe(player);

        const timerData: TimerData = {
            timeouts: [],
            connection,
            player,
            channel: interaction.channel,
            ended: false
        };
        activeTimers.set(userId, timerData);

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

        let isFocusTime = true;

        if (bgmName) {
            const bgmPath = path.join(BGM_DIR, bgmName);
            if (fs.existsSync(bgmPath)) {
                player.play(createAudioResource(bgmPath));

                player.on(AudioPlayerStatus.Idle, () => {
                    // 집중 시간일 때만 BGM 무한 반복 재생
                    if (isFocusTime && bgmName && fs.existsSync(bgmPath)) {
                        player.play(createAudioResource(bgmPath));
                    }
                });
            } else {
                sendToChannel(timerData.channel, `⚠️ (경고) \`${bgmName}\` 파일을 찾을 수 없어 배경 음악 없이 진행합니다.`);
                bgmName = null;
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
}

client.login(token);
import type { AutocompleteInteraction, ChatInputCommandInteraction, Interaction } from 'discord.js';
import fs from 'node:fs';
import { BGM_DIR, NOTIFY_DIR, userAudioSettings, getAudioSettings, saveAudioSettings, listAudioFiles, isAvailableAudioFile } from './audio.js';
import { activeTimers, findGuildTimer, startTimer, stopTimer } from './timer.js';

const HELP_MESSAGE = `🍅 **뽀모도로 봇 사용법 안내** 🍅

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
진행 중인 타이머를 즉시 중지하고 봇을 내보냅니다.`;

const SAVE_FAILED_NOTICE = '\n⚠️ 설정을 파일에 저장하지 못해 봇을 재시작하면 초기화됩니다.';

export async function handleInteraction(interaction: Interaction): Promise<unknown> {
    if (interaction.isAutocomplete()) {
        if (interaction.commandName !== '뽀모도로') return;
        return handleAutocomplete(interaction);
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName !== '뽀모도로') return;

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === '도움말') return interaction.reply({ content: HELP_MESSAGE, ephemeral: true });
    if (subcommand === '목록') return handleList(interaction);
    if (subcommand === '중지') return handleStop(interaction);
    if (subcommand === '배경음') return handleBgm(interaction);
    if (subcommand === '알림음') return handleNotify(interaction);
    if (subcommand === '시작') return handleStart(interaction);
}

// '/뽀모도로 배경음', '/뽀모도로 알림음' 파일명 자동완성
function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const isBgm = interaction.options.getSubcommand() === '배경음';
    const focused = interaction.options.getFocused().toLowerCase();
    const files = listAudioFiles(isBgm ? BGM_DIR : NOTIFY_DIR);
    const candidates = isBgm ? ['없음', ...files] : files;

    return interaction.respond(
        candidates
            .filter(f => f.length <= 100 && f.toLowerCase().includes(focused))
            .slice(0, 25)
            .map(f => ({ name: f, value: f }))
    );
}

// '/뽀모도로 목록'
function handleList(interaction: ChatInputCommandInteraction): Promise<unknown> {
    let replyMsg = '🎵 **사용 가능한 오디오 목록:**\n\n';

    replyMsg += '**[배경음 (background-sound)]**\n';
    if (fs.existsSync(BGM_DIR)) {
        const bgmFiles = listAudioFiles(BGM_DIR);
        replyMsg += bgmFiles.length > 0 ? bgmFiles.map(f => `- \`${f}\``).join('\n') + '\n' : '📂 파일이 없습니다.\n';
    } else {
        replyMsg += '📂 폴더가 없습니다.\n';
    }

    replyMsg += '\n**[알림음 (notify-sound)]**\n';
    if (fs.existsSync(NOTIFY_DIR)) {
        const notifyFiles = listAudioFiles(NOTIFY_DIR);
        replyMsg += notifyFiles.length > 0 ? notifyFiles.map(f => `- \`${f}\``).join('\n') : '📂 파일이 없습니다.';
    } else {
        replyMsg += '📂 폴더가 없습니다.';
    }

    return interaction.reply({ content: replyMsg, ephemeral: true });
}

// '/뽀모도로 중지'
function handleStop(interaction: ChatInputCommandInteraction): Promise<unknown> {
    const timerData = activeTimers.get(interaction.user.id);
    if (!timerData) {
        return interaction.reply({ content: '❌ 현재 진행 중인 뽀모도로 타이머가 없습니다.', ephemeral: true });
    }

    stopTimer(interaction.user.id, timerData);
    return interaction.reply('🛑 뽀모도로 타이머를 중지했습니다.');
}

// '/뽀모도로 배경음'
function handleBgm(interaction: ChatInputCommandInteraction): Promise<unknown> {
    let bgmName: string | null = interaction.options.getString('파일명', true);
    if (bgmName === '없음' || bgmName === '무음') bgmName = null;
    else if (!bgmName.endsWith('.mp3')) bgmName += '.mp3';

    if (bgmName && !isAvailableAudioFile(BGM_DIR, bgmName)) {
        return interaction.reply({
            content: `❌ 배경음 폴더에서 \`${bgmName}\` 파일을 찾을 수 없습니다. \`/뽀모도로 목록\`으로 사용 가능한 파일을 확인해 주세요.`,
            ephemeral: true,
            allowedMentions: { parse: [] }
        });
    }

    const userSettings = getAudioSettings(interaction.user.id);
    userSettings.bgmName = bgmName;
    userAudioSettings.set(interaction.user.id, userSettings);
    const saved = saveAudioSettings();

    return interaction.reply({
        content: `🎵 배경음이 **${bgmName ? bgmName : '없음(무음)'}**(으)로 설정되었습니다!${saved ? '' : SAVE_FAILED_NOTICE}`,
        allowedMentions: { parse: [] }
    });
}

// '/뽀모도로 알림음'
function handleNotify(interaction: ChatInputCommandInteraction): Promise<unknown> {
    let notifyName = interaction.options.getString('파일명', true);
    if (!notifyName.endsWith('.mp3')) notifyName += '.mp3';

    if (!isAvailableAudioFile(NOTIFY_DIR, notifyName)) {
        return interaction.reply({
            content: `❌ 알림음 폴더에서 \`${notifyName}\` 파일을 찾을 수 없습니다. \`/뽀모도로 목록\`으로 사용 가능한 파일을 확인해 주세요.`,
            ephemeral: true,
            allowedMentions: { parse: [] }
        });
    }

    const userSettings = getAudioSettings(interaction.user.id);
    userSettings.notifyName = notifyName;
    userAudioSettings.set(interaction.user.id, userSettings);
    const saved = saveAudioSettings();

    return interaction.reply({
        content: `🔔 알림음이 **${notifyName}**(으)로 설정되었습니다!${saved ? '' : SAVE_FAILED_NOTICE}`,
        allowedMentions: { parse: [] }
    });
}

// '/뽀모도로 시작'
async function handleStart(interaction: ChatInputCommandInteraction): Promise<unknown> {
    const userId = interaction.user.id;
    const existingTimer = activeTimers.get(userId);
    if (existingTimer && !existingTimer.ended) {
        return interaction.reply({ content: '⏳ 현재 뽀모도로 타이머가 이미 진행 중입니다! (중지하려면 `/뽀모도로 중지`를 입력하세요)', ephemeral: true });
    }

    if (!interaction.inCachedGuild() || !interaction.member.voice.channel) {
        return interaction.reply({ content: '❌ 봇이 알림음을 재생하려면 먼저 음성 채널에 접속해 있어야 합니다.', ephemeral: true });
    }

    const guildTimer = findGuildTimer(interaction.guildId);
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
    const workTimeMs = workMins * 60 * 1000;
    const breakTimeMs = breakMins * 60 * 1000;

    const { bgmName, notifyName } = getAudioSettings(userId);

    const workEndTime = Math.floor((Date.now() + workTimeMs) / 1000);
    let settingMsg = `⚙️ **설정**: 집중 ${workMins}분 / 휴식 ${breakMins}분`;
    if (bgmName) settingMsg += ` / 배경음: ${bgmName}`;
    settingMsg += ` / 알림음: ${notifyName}`;

    await interaction.reply(`🍅 **뽀모도로 타이머 시작!** 딴짓 금지, 집중해 보세요! (종료: <t:${workEndTime}:R>)\n${settingMsg}`);

    startTimer({
        userId,
        voiceChannel,
        textChannel: interaction.channel,
        workTimeMs,
        breakTimeMs,
        bgmName,
        notifyName
    });
}

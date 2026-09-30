import 'dotenv/config';
import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import { commands } from './commands.js';
import { handleInteraction } from './interactions.js';

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

client.login(token);

import { SlashCommandBuilder } from 'discord.js';

// -----------------------------------------------------------------------------------------
// 슬래시 커맨드 정의 (Slash Commands)
// 참고: 슬래시 커맨드 이름에는 띄어쓰기를 사용할 수 없으므로 '/뽀모도로' 커맨드의 서브커맨드로 등록합니다.
// -----------------------------------------------------------------------------------------
export const commands = [
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

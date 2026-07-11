/**
 * 処理を自動再開するための「時間主導トリガー」を管理する。
 *
 * トリガーは 1 ユーザー 1 スクリプトあたり 20 個までという上限があるため、
 * 作りっぱなしにせず、必ず削除とセットで運用する。
 */

/** トリガーが起動する関数名(main.ts の resumeTransfer) */
const RESUME_HANDLER_NAME = 'resumeTransfer';

/** 再開用の一回限りのトリガーを予約する */
function scheduleResume(): void {
  // 二重予約やトリガー上限超過を防ぐため、既存の再開トリガーを消してから作る
  deleteResumeTriggers();
  ScriptApp.newTrigger(RESUME_HANDLER_NAME).timeBased().after(CONFIG.resumeDelayMs).create();
  console.log(`約 ${Math.round(CONFIG.resumeDelayMs / 1000)} 秒後に自動で再開します。`);
}

/** 再開用トリガーをすべて削除する */
function deleteResumeTriggers(): void {
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === RESUME_HANDLER_NAME) {
      ScriptApp.deleteTrigger(trigger);
    }
  }
}

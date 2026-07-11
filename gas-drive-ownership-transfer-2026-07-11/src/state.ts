/**
 * 実行状態(TransferState)をスクリプトプロパティへ保存・復元する。
 *
 * スクリプトプロパティには「1 つの値につき 9KB まで」という上限がある。
 * フォルダキューが長くなると 9KB を超えることがあるため、JSON 文字列を
 * 一定の長さで分割(チャンク化)して複数のプロパティに保存する。
 */

/** チャンクの個数を記録するプロパティのキー */
const STATE_CHUNK_COUNT_KEY = 'TRANSFER_STATE_CHUNK_COUNT';
/** 各チャンクのキーの接頭辞(TRANSFER_STATE_CHUNK_0, _1, ...) */
const STATE_CHUNK_KEY_PREFIX = 'TRANSFER_STATE_CHUNK_';
/** 1 チャンクの最大文字数(9KB 制限に対する余裕を持たせた値) */
const STATE_CHUNK_SIZE = 8000;

/** 状態を JSON にしてチャンク分割し、スクリプトプロパティへ保存する */
function saveState(state: TransferState): void {
  const props = PropertiesService.getScriptProperties();
  const json = JSON.stringify(state);
  const chunks: string[] = [];
  for (let i = 0; i < json.length; i += STATE_CHUNK_SIZE) {
    chunks.push(json.slice(i, i + STATE_CHUNK_SIZE));
  }
  // 前回の保存より短くなったとき、古いチャンクが残らないよう先に全て消す
  clearState();
  chunks.forEach((chunk, index) => {
    props.setProperty(STATE_CHUNK_KEY_PREFIX + index, chunk);
  });
  props.setProperty(STATE_CHUNK_COUNT_KEY, String(chunks.length));
}

/** 保存された状態を復元する。保存がなければ null を返す */
function loadState(): TransferState | null {
  const props = PropertiesService.getScriptProperties();
  const countText = props.getProperty(STATE_CHUNK_COUNT_KEY);
  if (countText === null) {
    return null;
  }
  const count = Number(countText);
  let json = '';
  for (let i = 0; i < count; i++) {
    const chunk = props.getProperty(STATE_CHUNK_KEY_PREFIX + i);
    if (chunk === null) {
      console.error(
        `状態データが壊れています(チャンク ${i} が見つかりません)。` +
          'stopTransfer() を実行してリセットしてください。'
      );
      return null;
    }
    json += chunk;
  }
  return JSON.parse(json) as TransferState;
}

/** 保存された状態をすべて削除する */
function clearState(): void {
  const props = PropertiesService.getScriptProperties();
  const allKeys = Object.keys(props.getProperties());
  for (const key of allKeys) {
    if (key === STATE_CHUNK_COUNT_KEY || key.indexOf(STATE_CHUNK_KEY_PREFIX) === 0) {
      props.deleteProperty(key);
    }
  }
}

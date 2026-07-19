/**
 * 招待方式(pendingOwner)で自分宛てに送られた所有権を一括で「承諾」する(受信側の操作)。
 *
 * 送信側が「招待方式」で実行すると、対象ファイルに pendingOwner の権限が付き、
 * 台帳(譲渡ログ)に「招待済み」行(譲渡先 = 受信側)が記録される。
 * 受信側(新しい所有者)は、自分のアカウントでこの承諾を実行して、
 * それらの所有権をまとめて受け取る。
 *
 * 承諾は Drive API v3 で「自分の権限を role = owner + transferOwnership = true に更新」して行う。
 * 個人アカウント間の所有権移転は、この 2 段階(招待 → 承諾)が必須。
 */
function acceptPendingOwnerships(): AcceptResult {
  // 同じ利用者の多重実行を防ぐ(ユーザーロックは利用者ごとに独立)
  const lock = LockService.getUserLock();
  if (!lock.tryLock(CONFIG.lockWaitMs)) {
    throw new Error(
      '別の実行が進行中のためロックを取得できませんでした。しばらく待ってから再実行してください。'
    );
  }
  try {
    const me = Session.getEffectiveUser().getEmail();
    const candidates = collectInviteCandidates(me);
    const result: AcceptResult = {
      total: candidates.length,
      accepted: 0,
      skipped: 0,
      errors: 0,
      remaining: 0,
      rows: [],
    };
    // GAS の 6 分制限に備え、時間切れが近づいたら中断する(自動再開はしないため、残りは再実行で処理)
    const deadline = Date.now() + CONFIG.maxRuntimeMs;
    let index = 0;
    for (; index < candidates.length; index++) {
      if (Date.now() >= deadline) {
        break;
      }
      const candidate = candidates[index];
      try {
        if (acceptOne(candidate.id, me)) {
          result.accepted++;
          result.rows.push([
            new Date(),
            me,
            '承諾済み',
            'ファイル',
            candidate.name,
            candidate.id,
            me,
            '招待方式の承諾',
          ]);
        } else {
          result.skipped++;
          result.rows.push([
            new Date(),
            me,
            '承諾スキップ',
            'ファイル',
            candidate.name,
            candidate.id,
            me,
            '既に所有者、または自分宛ての招待が見つかりません',
          ]);
        }
      } catch (e) {
        result.errors++;
        const message = e instanceof Error ? e.message : String(e);
        result.rows.push([
          new Date(),
          me,
          '承諾失敗',
          'ファイル',
          candidate.name,
          candidate.id,
          me,
          message,
        ]);
      }
    }
    result.remaining = candidates.length - index;
    appendLogRows(result.rows);
    return result;
  } finally {
    lock.releaseLock();
  }
}

/**
 * 台帳(譲渡ログ)から「自分宛ての招待済み」ファイルを抽出する。
 * 「招待済み」かつ譲渡先 = 自分の行を集め、既に「承諾済み」の行がある ID は除外する(再実行に安全)。
 */
function collectInviteCandidates(me: string): InviteCandidate[] {
  const ss = getContainerSpreadsheet();
  if (ss === null) {
    throw new Error('スプレッドシートに紐付いていません。');
  }
  const log = ss.getSheetByName(LOG_SHEET_NAME);
  if (log === null || log.getLastRow() < 2) {
    return [];
  }
  const values = log.getRange(2, 1, log.getLastRow() - 1, LOG_HEADERS.length).getValues();
  const meLower = me.toLowerCase();
  const acceptedIds = new Set<string>();
  const invited = new Map<string, string>(); // id -> name
  for (const row of values) {
    // 列: 0 日時 / 1 実行者 / 2 結果 / 3 種別 / 4 名前 / 5 ID / 6 譲渡先 / 7 詳細
    const result = String(row[2]).trim();
    const name = String(row[4]);
    const id = String(row[5]).trim();
    const target = String(row[6]).trim().toLowerCase();
    if (id === '') {
      continue;
    }
    if (result === '承諾済み') {
      acceptedIds.add(id);
    } else if (result === '招待済み' && target === meLower) {
      invited.set(id, name);
    }
  }
  const candidates: InviteCandidate[] = [];
  invited.forEach((name, id) => {
    if (!acceptedIds.has(id)) {
      candidates.push({ id: id, name: name });
    }
  });
  return candidates;
}

/**
 * 1 ファイルの所有権を承諾する。自分の権限を owner + transferOwnership=true に更新する。
 * 承諾できた場合は true、承諾不要/不可(既に所有者・招待が見つからない)の場合は false を返す。
 */
function acceptOne(fileId: string, me: string): boolean {
  const api = driveApi();
  const list = api.Permissions.list(fileId, {
    fields: 'permissions(id,emailAddress,role,pendingOwner)',
  });
  const permissions = list.permissions;
  if (permissions === undefined) {
    return false;
  }
  const meLower = me.toLowerCase();
  const mine = permissions.find(
    (p) => (p.emailAddress === undefined ? '' : p.emailAddress).toLowerCase() === meLower
  );
  if (mine === undefined || mine.id === undefined) {
    return false; // 自分宛ての権限(招待)が見つからない
  }
  if (mine.role === 'owner') {
    return false; // 既に所有者(承諾済み)
  }
  api.Permissions.update({ role: 'owner' }, fileId, mine.id, { transferOwnership: true });
  return true;
}

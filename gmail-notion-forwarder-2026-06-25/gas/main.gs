// Gmail to Notion Forwarder
// Forwards emails from Gmail to Notion database

const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();

// Notion API 設定
const NOTION_API_KEY = SCRIPT_PROPERTIES.getProperty('NOTION_API_KEY');
const NOTION_DATABASE_ID = SCRIPT_PROPERTIES.getProperty('NOTION_DATABASE_ID');

// Gmail ラベル（これを対象にメールを転送）
const GMAIL_LABEL = 'ToNotion';

/**
 * Gmail のメールを Notion に転送する
 */
function forwardEmailsToNotion() {
  try {
    // 未処理のメールを取得
    const threads = GmailApp.search('label:' + GMAIL_LABEL + ' is:unread');

    if (threads.length === 0) {
      Logger.log('No unread emails found');
      return;
    }

    Logger.log('Found ' + threads.length + ' unread email(s)');

    threads.forEach(thread => {
      const messages = thread.getMessages();

      messages.forEach(message => {
        const email = {
          subject: message.getSubject(),
          from: message.getFrom(),
          date: message.getDate(),
          body: message.getPlainBody(),
          threadId: message.getThread().getId()
        };

        // Notion に追加
        createNotionPage(email);

        // メールに処理済みマークを付与
        message.star();
        thread.removeLabel(GmailApp.getUserLabelByName(GMAIL_LABEL));
      });
    });

    Logger.log('Successfully forwarded emails to Notion');

  } catch (error) {
    Logger.log('Error: ' + error.toString());
    sendErrorNotification(error);
  }
}

/**
 * Notion に新規ページを作成
 */
function createNotionPage(email) {
  const url = 'https://api.notion.com/v1/pages';

  const payload = {
    parent: {
      database_id: NOTION_DATABASE_ID
    },
    properties: {
      'Subject': {
        title: [
          {
            text: {
              content: email.subject
            }
          }
        ]
      },
      'From': {
        email: email.from
      },
      'Received Date': {
        date: {
          start: new Date(email.date).toISOString().split('T')[0]
        }
      },
      'Gmail Thread ID': {
        rich_text: [
          {
            text: {
              content: email.threadId
            }
          }
        ]
      }
    },
    children: [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: email.body.substring(0, 2000) // 最初の2000文字
              }
            }
          ]
        }
      }
    ]
  };

  const options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + NOTION_API_KEY,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const result = JSON.parse(response.getContentText());

  if (response.getResponseCode() !== 200) {
    throw new Error('Notion API error: ' + JSON.stringify(result));
  }

  Logger.log('Created Notion page: ' + result.id);
  return result.id;
}

/**
 * エラー通知を送信
 */
function sendErrorNotification(error) {
  // オプション：エラー通知をメール or Slack で送信
  Logger.log('Error notification would be sent here');
}

/**
 * テスト用：特定のメールを手動で転送
 */
function testForwardEmail() {
  const threads = GmailApp.search('label:' + GMAIL_LABEL);
  if (threads.length > 0) {
    const message = threads[0].getMessages()[0];
    const email = {
      subject: message.getSubject(),
      from: message.getFrom(),
      date: message.getDate(),
      body: message.getPlainBody(),
      threadId: message.getThread().getId()
    };

    Logger.log('Testing with email: ' + email.subject);
    createNotionPage(email);
  } else {
    Logger.log('No emails found with label: ' + GMAIL_LABEL);
  }
}

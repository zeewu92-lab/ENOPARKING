export const runtime = 'nodejs';

const MAX_TITLE_LENGTH = 80;
const MAX_CONTENT_LENGTH = 2000;
const MAX_CONTACT_LENGTH = 120;
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 700 * 1024;
const COOLDOWN_MS = 15 * 1000;
let lastSubmissionAt = 0;

async function createMd5(buffer) {
  // 延迟加载 Node 内置模块，避免函数初始化阶段因为运行时差异直接失败。
  const { createHash } = await import('node:crypto');
  return createHash('md5').update(buffer).digest('hex');
}

async function normalizeImage(item) {
  if (!item || typeof item !== 'object') return null;

  const data = String(item.data || '').replace(
    /^data:image\/[^;]+;base64,/i,
    ''
  );

  if (!data || !/^[A-Za-z0-9+/=]+$/.test(data)) return null;

  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;

  return {
    base64: data,
    md5: await createMd5(buffer)
  };
}

async function sendWebhook(webhook, payload) {
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const result = await response.json().catch(() => null);

  if (!response.ok || result?.errcode) {
    console.error('WECHAT_WORK_FEEDBACK_FAILED', {
      status: response.status,
      errcode: result?.errcode,
      errmsg: result?.errmsg
    });

    const error = new Error(
      result?.errmsg || ('上游服务返回 HTTP ' + response.status)
    );
    error.status = response.status;
    error.code = result?.errcode || '';
    throw error;
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const webhook = process.env.WECHAT_WORK_BOT_WEBHOOK;
    if (!webhook) {
      return res.status(503).json({
        error: '反馈服务尚未配置',
        code: 'FEEDBACK_WEBHOOK_NOT_CONFIGURED'
      });
    }

    const now = Date.now();
    if (now - lastSubmissionAt < COOLDOWN_MS) {
      return res.status(429).json({
        error: '提交太频繁，请稍后再试',
        code: 'FEEDBACK_RATE_LIMITED'
      });
    }

    const body =
      req.body && typeof req.body === 'object' ? req.body : {};

    const category = String(
      body.categoryLabel || body.category || '其他'
    ).trim().slice(0, 40);
    const title = String(body.title || '')
      .trim()
      .slice(0, MAX_TITLE_LENGTH);
    const content = String(body.content || '')
      .trim()
      .slice(0, MAX_CONTENT_LENGTH);
    const contact = String(body.contact || '')
      .trim()
      .slice(0, MAX_CONTACT_LENGTH);

    const device =
      body.device && typeof body.device === 'object' ? body.device : null;

    const rawImages = Array.isArray(body.images)
      ? body.images.slice(0, MAX_IMAGES)
      : [];

    const images = [];

    for (const item of rawImages) {
      const image = await normalizeImage(item);
      if (!image) {
        return res.status(400).json({
          error: '图片无效或超过 700 KB，请重新选择',
          code: 'FEEDBACK_IMAGE_INVALID'
        });
      }
      images.push(image);
    }

    if (content.length < 5) {
      return res.status(400).json({
        error: '请填写更完整的反馈内容',
        code: 'FEEDBACK_CONTENT_TOO_SHORT'
      });
    }

    lastSubmissionAt = now;

    const time = new Date().toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai'
    });

    const lines = [
      '【语未央 · 用户反馈】',
      '',
      '类型：' + category,
      '标题：' + title,
      '时间：' + time,
      '',
      '内容：',
      content
    ];

    if (contact) {
      lines.push('', '联系方式：' + contact);
    }

    if (device) {
      const deviceParts = [
        device.platform && '平台：' + String(device.platform).slice(0, 80),
        device.language && '语言：' + String(device.language).slice(0, 30),
        device.viewport && '画面：' + String(device.viewport).slice(0, 30),
        device.timezone && '时区：' + String(device.timezone).slice(0, 60)
      ].filter(Boolean);

      if (deviceParts.length) {
        lines.push('', '装置信息：', ...deviceParts);
      }
    }

    try {
      await sendWebhook(webhook, {
        msgtype: 'text',
        text: { content: lines.join('\n') }
      });

      for (const image of images) {
        await sendWebhook(webhook, {
          msgtype: 'image',
          image: {
            base64: image.base64,
            md5: image.md5
          }
        });
      }

      return res.status(200).json({
        ok: true,
        imageCount: images.length
      });
    } catch (error) {
      const detail = String(
        error?.message || error || '未知服务器错误'
      ).slice(0, 300);

      const code = 'FEEDBACK_WEBHOOK_' + (error?.status || 502);

      console.error('WECHAT_WORK_FEEDBACK_ERROR', {
        code,
        detail,
        stack: error?.stack
      });

      return res.status(502).json({
        error: '反馈发送失败，请稍后再试',
        code,
        detail
      });
    }
  } catch (error) {
    const detail = String(
      error?.message || error || '未知服务器错误'
    ).slice(0, 300);

    console.error('FEEDBACK_HANDLER_ERROR', {
      detail,
      stack: error?.stack
    });

    return res.status(500).json({
      error: '反馈服务发生内部错误，请稍后再试',
      code: 'FEEDBACK_HANDLER_500',
      detail
    });
  }
}

const MAX_CONSOLE_ENTRIES = 80;
const consoleBuffer = [];

// 这里先把这一步处理好，后面的逻辑就顺了。
function safeString(value) {
  try {
    if (value instanceof Error) return value.stack || value.message || String(value);
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function jiluConsole(dengji, args) {
  try {
    consoleBuffer.push({
      time: new Date().toISOString(),
      level,
      message: args.map(safeString).join(' ')
    });
    if (consoleBuffer.length > MAX_CONSOLE_ENTRIES) consoleBuffer.shift();
  } catch {}
}

['error', 'warn'].forEach(dengji => {
  const original = console[dengji];
  console[dengji] = function (...args) {
    jiluConsole(dengji, args);
    return original.apply(this, args);
  };
});

function collectCunchu(storage) {
  try {
    return {
      available: true,
      keys: Object.keys(storage)
    };
  } catch (error) {
    return {
      available: false,
      error: safeString(error)
    };
  }
}

function collectPerformance() {
  try {
    const navigation = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource').slice(-40);

    return {
      navigation: navigation ? {
        type: navigation.type,
        startTime: navigation.startTime,
        duration: navigation.duration,
        domInteractive: navigation.domInteractive,
        domContentLoadedEventEnd: navigation.domContentLoadedEventEnd,
        loadEventEnd: navigation.loadEventEnd,
        transferSize: navigation.transferSize,
        encodedBodySize: navigation.encodedBodySize,
        decodedBodySize: navigation.decodedBodySize
      } : null,
      recentResources: resources.map(resource => ({
        name: resource.name,
        initiatorType: resource.initiatorType,
        duration: resource.duration,
        transferSize: resource.transferSize,
        decodedBodySize: resource.decodedBodySize
      }))
    };
  } catch (error) {
    return { error: safeString(error) };
  }
}

function collectHuanjing() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const jiyi = performance.memory;

  return {
    url: location.href,
    origin: location.origin,
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
    referrer: document.referrer,
    userAgent: navigator.userAgent,
    userAgentData: navigator.userAgentData ? {
      mobile: navigator.userAgentData.mobile,
      platform: navigator.userAgentData.platform,
      brands: navigator.userAgentData.brands
    } : null,
    language: navigator.language,
    languages: navigator.languages,
    platform: navigator.platform,
    vendor: navigator.vendor,
    online: navigator.onLine,
    cookieEnabled: navigator.cookieEnabled,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory,
    maxTouchPoints: navigator.maxTouchPoints,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    viewport: {
      width: innerWidth,
      height: innerHeight,
      devicePixelRatio: devicePixelRatio
    },
    screen: {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.pixelDepth
    },
    document: {
      readyState: document.readyState,
      visibilityState: document.visibilityState,
      characterSet: document.characterSet,
      title: document.title,
      bodyExists: !!document.body,
      rootExists: !!document.getElementById('root'),
      rootChildCount: document.getElementById('root')?.childElementCount ?? null
    },
    connection: connection ? {
      effectiveType: connection.effectiveType,
      downlink: connection.downlink,
      rtt: connection.rtt,
      saveData: connection.saveData,
      type: connection.type
    } : null,
    memory: jiyi ? {
      jsHeapSizeLimit: jiyi.jsHeapSizeLimit,
      totalJSHeapSize: jiyi.totalJSHeapSize,
      usedJSHeapSize: jiyi.usedJSHeapSize
    } : null,
    storage: {
      localStorage: collectCunchu(localStorage),
      sessionStorage: collectCunchu(sessionStorage)
    },
    serviceWorker: {
      supported: 'serviceWorker' in navigator,
      controller: navigator.serviceWorker?.controller?.scriptURL || null,
      registrations: 'serviceWorker' in navigator
        ? 'pending'
        : []
    }
  };
}

function collectDom() {
  try {
    return {
      scripts: Array.from(document.scripts).map(script => ({
        src: script.src || null,
        type: script.type || null,
        async: script.async,
        defer: script.defer,
        readyState: script.readyState || null
      })),
      stylesheets: Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(node => ({
        tag: node.tagName,
        href: node.href || null,
        disabled: !!node.disabled
      })),
      rootHTMLPreview: document.getElementById('root')?.outerHTML?.slice(0, 5000) || null
    };
  } catch (error) {
    return { error: safeString(error) };
  }
}

async function collectServiceWorkers() {
  if (!('serviceWorker' in navigator)) return [];
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    return registrations.map(registration => ({
      scope: registration.scope,
      installing: registration.installing?.scriptURL || null,
      waiting: registration.waiting?.scriptURL || null,
      active: registration.active?.scriptURL || null
    }));
  } catch (error) {
    return [{ error: safeString(error) }];
  }
}

// 这里整理错误状态，先记录当前结果，再交给后续复习流程。
function normalizeCuowu(error, fallbackMessage = 'Unknown error') {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || fallbackMessage,
      stack: error.stack || '(stack unavailable)',
      cause: error.cause ? safeString(error.cause) : null
    };
  }

  if (error && typeof error === 'object') {
    return {
      name: String(error.name || 'UnknownError'),
      message: String(error.message || fallbackMessage),
      stack: String(error.stack || '(stack unavailable)'),
      cause: error.cause ? safeString(error.cause) : null
    };
  }

  return {
    name: 'NonErrorThrown',
    message: String(error ?? fallbackMessage),
    stack: '(stack unavailable)',
    cause: null
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function xuanranBaogao(baogao) {
  const gen = document.getElementById('root') || document.body;
  if (!gen) return;

  const sections = [
    ['ERROR ID', baogao.id],
    ['TIME', baogao.time],
    ['PHASE', baogao.phase],
    ['EVENT', baogao.event],
    ['ERROR NAME', baogao.error.name],
    ['ERROR MESSAGE', baogao.error.message],
    ['ERROR STACK', baogao.error.stack],
    ['CAUSE', baogao.error.cause || '(none)'],
    ['COMPONENT STACK', baogao.componentStack || '(none)'],
    ['EVENT DETAILS', baogao.eventDetails || '(none)'],
    ['PAGE', JSON.stringify(baogao.environment, null, 2)],
    ['DOM AND LOADING', JSON.stringify(baogao.dom, null, 2)],
    ['PERFORMANCE', JSON.stringify(baogao.performance, null, 2)],
    ['SERVICE WORKERS', JSON.stringify(baogao.serviceWorkers, null, 2)],
    ['RECENT CONSOLE ERROR/WARN', JSON.stringify(baogao.console, null, 2)]
  ];

  gen.innerHTML = '';
  gen.style.cssText = 'min-height:100vh;margin:0;padding:0;background:#120b0e;color:#f8e9ed;';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'box-sizing:border-box;width:100%;max-width:1100px;margin:0 auto;padding:20px;font:13px/1.65 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;';

  wrapper.innerHTML =
    '<div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#b8325b;color:#fff;font-weight:800;letter-spacing:.08em;">ENOPARKING GLOBAL ERROR REPORT</div>' +
    '<h1 style="font:700 26px/1.25 system-ui,sans-serif;margin:18px 0 8px;">應用程式發生錯誤</h1>' +
    '<p style="font:14px/1.7 system-ui,sans-serif;color:#d8c3c9;margin:0 0 20px;">以下資料由目前瀏覽器在錯誤發生當下收集。沒有填充虛假的錯誤資訊。每個欄位都標明實際可取得的資料。</p>';

  sections.forEach(([title, value]) => {
    const section = document.createElement('section');
    section.style.cssText = 'margin:0 0 12px;padding:14px 16px;border:1px solid #4b2934;border-radius:12px;background:#1d1116;';
    section.innerHTML =
      '<div style="color:#b8949f;font:700 11px/1.4 system-ui,sans-serif;letter-spacing:.08em;margin-bottom:7px;">' +
      escapeHtml(title) +
      '</div>' +
      '<pre style="margin:0;white-space:pre-wrap;overflow-wrap:anywhere;color:#f5dce3;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">' +
      escapeHtml(value) +
      '</pre>';
    wrapper.appendChild(section);
  });

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;';
  actions.innerHTML =
    '<button id="eng-error-reload" style="flex:1;min-width:160px;padding:14px;border:0;border-radius:10px;background:#e14f82;color:#fff;font-weight:800;">重新載入</button>' +
    '<button id="eng-error-copy" style="flex:1;min-width:160px;padding:14px;border:1px solid #754153;border-radius:10px;background:#28151d;color:#f8e9ed;font-weight:800;">複製完整報告</button>';
  wrapper.appendChild(actions);

  gen.appendChild(wrapper);

  document.getElementById('eng-error-reload')?.addEventListener('click', () => location.reload());
  document.getElementById('eng-error-copy')?.addEventListener('click', async event => {
    const anni = event.currentTarget;
    try {
      await navigator.clipboard.writeText(JSON.stringify(baogao, null, 2));
      anni.textContent = '已複製';
    } catch {
      anni.textContent = '複製失敗，請長按文字';
    }
  });
}

let baogaoLock = false;

export async function baogaoCuowu(cuowu, phase = 'UNKNOWN', event = 'UNKNOWN', extra = {}) {
  if (baogaoLock) return;
  baogaoLock = true;

  const normalized = normalizeCuowu(cuowu);
  const baogao = {
    id: 'ENG-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    time: new Date().toISOString(),
    phase: String(phase),
    event: String(event),
    error: normalized,
    componentStack: extra.componentStack || null,
    eventDetails: extra.eventDetails || null,
    environment: collectHuanjing(),
    dom: collectDom(),
    performance: collectPerformance(),
    serviceWorkers: await collectServiceWorkers(),
    console: consoleBuffer.slice(-30)
  };

  console.error('[ENoParking] GLOBAL ERROR REPORT', baogao);
  if (extra.render !== false) xuanranBaogao(baogao);
  return baogao;
}

export async function baogaoZhanghuServiceCuowu(cuowu, details = {}) {
  return baogaoCuowu(
    cuowu,
    'ACCOUNT_API',
    'ACCOUNT_SERVICE_ERROR',
    {
      eventDetails: JSON.stringify({
        path: details.path || null,
        method: details.method || null,
        status: details.status ?? null,
        statusText: details.statusText || null,
        responseError: details.responseError || null,
        responseBodyAvailable: !!details.responseBodyAvailable,
        network: details.network || false
      }, null, 2),
      render: false
    }
  );
}

export function anzhuangQuanqiuCuowuBaogaoren() {
  if (window.__ENGNOCRAZY_GLOBAL_ERROR_REPORTER__) return;
  window.__ENGNOCRAZY_GLOBAL_ERROR_REPORTER__ = true;

  window.addEventListener('error', event => {
    const target = event.target || event.srcElement;

    if (target && target !== window && !event.error) {
      const tag = target.tagName || 'UNKNOWN';
      const source = target.src || target.href || '(no source)';
      baogaoCuowu(
        new Error('Resource failed to load: ' + tag + ' ' + source),
        'GLOBAL',
        'RESOURCE_ERROR',
        {
          eventDetails: JSON.stringify({
            type: event.type,
            targetTag: tag,
            targetSrc: target.src || null,
            targetHref: target.href || null
          }, null, 2)
        }
      );
      return;
    }

    baogaoCuowu(event.error || new Error(event.message || 'Unknown window error'), 'GLOBAL', 'JAVASCRIPT_ERROR', {
      eventDetails: JSON.stringify({
        type: event.type,
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno
      }, null, 2)
    });
  }, true);

  window.addEventListener('unhandledrejection', event => {
    baogaoCuowu(
      event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
      'GLOBAL',
      'UNHANDLED_REJECTION',
      {
        eventDetails: JSON.stringify({
          reasonType: typeof event.reason,
          reason: safeString(event.reason)
        }, null, 2)
      }
    );
  });

  window.addEventListener('securitypolicyviolation', event => {
    baogaoCuowu(
      new Error('Content Security Policy violation'),
      'GLOBAL',
      'SECURITY_POLICY_VIOLATION',
      {
        eventDetails: JSON.stringify({
          blockedURI: event.blockedURI,
          violatedDirective: event.violatedDirective,
          effectiveDirective: event.effectiveDirective,
          sourceFile: event.sourceFile,
          lineNumber: event.lineNumber,
          columnNumber: event.columnNumber,
          policy: event.originalPolicy
        }, null, 2)
      }
    );
  });
}

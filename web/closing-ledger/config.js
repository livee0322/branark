window.BRANARK_CLOSING_LEDGER_CONFIG = {
  appsScriptWebAppUrl: 'https://script.google.com/macros/s/AKfycbz86pVCWFnXmHLjr6d8Cm2HCgF8MrG33903-ivG3UbHTcfCc8xpNuSj7Aa91m15NOeo2Q/exec',
  maxFileSizeBytes: 8 * 1024 * 1024,
  healthTimeoutMs: 15000,
  requestTimeoutMs: 180000,
};

window.setTimeout(() => {
  if (document.querySelector('script[data-branark-upload-patch="true"]')) {
    return;
  }
  const patchScript = document.createElement('script');
  patchScript.src = './web/closing-ledger/upload-patch.js?v=20260703-7';
  patchScript.dataset.branarkUploadPatch = 'true';
  document.body.appendChild(patchScript);
}, 1000);
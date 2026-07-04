window.BRANARK_CLOSING_LEDGER_CONFIG = {
  appsScriptWebAppUrl: 'https://script.google.com/macros/s/AKfycbzDTBCKXytRLQnprpMnVhlsrrLnis7NFfJUTmU-oFZocpztR2W6vUiSzAx921DAH1AuyQ/exec',
  maxFileSizeBytes: 8 * 1024 * 1024,
  healthTimeoutMs: 15000,
  requestTimeoutMs: 540000,
};

window.setTimeout(function () {
  if (document.querySelector('script[data-branark-upload-patch="true"]')) return;
  var patchScript = document.createElement('scr' + 'ipt');
  patchScript.src = './web/closing-ledger/upload-patch.js?v=20260704-1';
  patchScript.dataset.branarkUploadPatch = 'true';
  document.body.appendChild(patchScript);
}, 1000);

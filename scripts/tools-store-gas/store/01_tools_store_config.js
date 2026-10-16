// 新規の利用者実行GAS専用。初期状態は無効。既存dist/gradeの設定を変更しない。
function toolsStoreConfig_() {
  var p = PropertiesService.getScriptProperties();
  function list(name) {
    try { var value = JSON.parse(p.getProperty(name) || '[]'); return Array.isArray(value) ? value : []; }
    catch (ignored) { return []; }
  }
  return {
    enabled: p.getProperty('TOOLS_STORE_ENABLED') === 'true',
    confirmationEnabled: p.getProperty('TOOLS_STORE_CONFIRMATION_ENABLED') === 'true',
    bindingKey: p.getProperty('TOOLS_STORE_BINDING_KEY') || '',
    allowedOrigins: list('TOOLS_STORE_ALLOWED_ORIGINS'),
    allowedDomains: list('TOOLS_STORE_ALLOWED_DOMAINS'),
    teacherOwners: list('TOOLS_STORE_TEACHER_OWNERS'),
    bindingLifetimeMs: 3600000
  };
}

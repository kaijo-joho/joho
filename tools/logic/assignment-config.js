// 実GASとの往復・教員の閲覧/復旧を検証するまでは有効にしない。
// 信頼先は配付コードで固定する。URLからこのリストやenabledを作らない。
window.JohoLogicAssignmentConfig = Object.freeze({ enabled: false, trustedOrigins: Object.freeze([]), retentionNotice: '' });

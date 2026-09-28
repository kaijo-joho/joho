#!/usr/bin/env python3
"""Interactive dedicated Drive OAuth setup. No scan downloads or cloud writes."""
import argparse
import json
import logging
import os
from pathlib import Path
import re
import sys

READ_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
MANAGE_SCOPES = [READ_SCOPE, 'https://www.googleapis.com/auth/drive.file',
                 'https://www.googleapis.com/auth/drive.metadata']
ARCHIVE_SCOPES = ['https://www.googleapis.com/auth/drive']


class SetupError(ValueError):
    """Only fixed, safe messages may be printed by the CLI."""


def private_path(value):
    path = Path(value).expanduser()
    if path.is_symlink():
        raise SetupError('認証ファイルにシンボリックリンクは使用できません。')
    path = path.resolve()
    if any((parent / '.git').exists() for parent in path.parents):
        raise SetupError('認証ファイルはGitリポジトリの外に置いてください。')
    return path


def load_client(path):
    data = json.loads(private_path(path).read_text())
    client = data.get('installed')
    if not isinstance(client, dict) or 'web' in data:
        raise SetupError('デスクトップアプリ用OAuthクライアントJSONを指定してください。')
    if (not isinstance(client.get('client_id'), str)
            or not client['client_id'].endswith('.apps.googleusercontent.com')
            or not client.get('client_secret')
            or client.get('auth_uri') not in ('https://accounts.google.com/o/oauth2/auth',
                                             'https://accounts.google.com/o/oauth2/v2/auth')
            or client.get('token_uri') != 'https://oauth2.googleapis.com/token'):
        raise SetupError('Googleが発行したOAuthクライアントJSONを確認してください。')
    return {'installed': client}


def output_path(value):
    path = private_path(value)
    if path.exists():
        raise SetupError('保存先は既に存在します。別名を指定してください。')
    # No automatic permission changes to an existing directory.
    if not path.parent.is_dir() or path.parent.stat().st_mode & 0o077:
        raise SetupError('保存先の親フォルダーを事前に作り、権限を700にしてください。')
    return path


def google_flow(data, scopes=None):
    from google_auth_oauthlib.flow import InstalledAppFlow
    return InstalledAppFlow.from_client_config(data, scopes=scopes or [READ_SCOPE],
                                               autogenerate_code_verifier=True)


def account_email(credentials):
    import httplib2
    from google_auth_httplib2 import AuthorizedHttp
    from googleapiclient.discovery import build
    http = AuthorizedHttp(credentials, http=httplib2.Http(timeout=60))
    with build('drive', 'v3', http=http, cache_discovery=False) as service:
        return service.about().get(fields='user(emailAddress)').execute()['user']['emailAddress']


def authorize(client_path, destination, expected_account, *, flow_factory=google_flow,
              get_account=account_email, access='read'):
    if access not in ('read', 'manage', 'archive'):
        raise SetupError('認可モードを確認してください。')
    scopes = {'read': [READ_SCOPE], 'manage': MANAGE_SCOPES, 'archive': ARCHIVE_SCOPES}[access]
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', expected_account):
        raise SetupError('処理用アカウントのメールアドレスを指定してください。')
    target = output_path(destination)
    data = load_client(client_path)
    flow = flow_factory(data) if access == 'read' else flow_factory(data, scopes=scopes)
    credentials = flow.run_local_server(
        host='127.0.0.1', port=0, open_browser=True, timeout_seconds=180,
        authorization_prompt_message='ブラウザで処理用アカウントと、要求されたDrive権限を確認してください。',
        success_message='Google認証の応答を受け取りました。結果はターミナルで確認してください。',
        prompt='consent select_account', login_hint=expected_account,
        access_type='offline', include_granted_scopes='false')
    granted = credentials.granted_scopes
    if not credentials.refresh_token:
        raise SetupError('継続利用用の認証を取得できませんでした。再認証してください。')
    if granted is not None and set(granted) != set(scopes):
        raise SetupError('許可された権限が要求した設定と異なるため保存しません。')
    if get_account(credentials).casefold() != expected_account.casefold():
        raise SetupError('選択されたGoogleアカウントが指定と異なるため保存しません。')
    payload = json.loads(credentials.to_json())
    payload['type'] = 'authorized_user'
    payload['scopes'] = scopes
    # Exclusive creation also protects against another process creating the target
    # while the browser is open. Never print the token or overwrite old credentials.
    output_path(target)
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(payload, stream)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
    except BaseException:
        target.unlink(missing_ok=True)
        raise
    return {'status': 'OK', 'access': {'read': 'drive.readonly', 'manage': 'drive.manage',
                                     'archive': 'drive.archive'}[access],
            'credentialsSaved': True}


def main(argv=None):
    parser = argparse.ArgumentParser(description='専用OAuthのGoogle認証（ブラウザで本人が同意）')
    parser.add_argument('--client-secrets', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--expected-account', required=True)
    parser.add_argument('--access', choices=['read', 'manage', 'archive'], default='read',
                        help='archiveはDrive全体の編集権限。原本移動の追加許可を得た場合だけ使用する')
    args = parser.parse_args(argv)
    # OAuth redirects and SDK debug logs can contain authorization codes/tokens.
    logging.disable(logging.CRITICAL)
    try:
        result = authorize(args.client_secrets, args.output, args.expected_account, access=args.access)
    except KeyboardInterrupt:
        print('認証を中止しました。', file=sys.stderr)
        return 130
    except SetupError as error:
        print(str(error), file=sys.stderr)
        return 1
    except Exception as error:
        print('認証できませんでした（' + type(error).__name__ + '）。設定・ブラウザ・接続を確認してください。', file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

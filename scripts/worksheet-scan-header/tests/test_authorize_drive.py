"""OAuth setup contract tests. No real credentials, browser, or network."""
import contextlib
import copy
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from authorize_drive import MANAGE_SCOPES, READ_SCOPE, SetupError, authorize, load_client, main

CLIENT = {'installed': {'client_id': 'test.apps.googleusercontent.com', 'client_secret': 'dummy',
    'auth_uri': 'https://accounts.google.com/o/oauth2/auth', 'token_uri': 'https://oauth2.googleapis.com/token'}}


class AuthorizeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.client = self.root / 'client.json'
        self.client.write_text(json.dumps(CLIENT))
        self.output = self.root / 'read-oauth.json'
        self.credentials = Mock(refresh_token='dummy-refresh', granted_scopes=[READ_SCOPE])
        self.credentials.to_json.return_value = json.dumps({'refresh_token': 'dummy-refresh',
            'client_id': 'test.apps.googleusercontent.com', 'client_secret': 'dummy', 'token': 'dummy-token'})
        self.flow = Mock()
        self.flow.run_local_server.return_value = self.credentials
        self.factory = Mock(return_value=self.flow)
        self.account = Mock(return_value='teacher@example.edu')

    def tearDown(self):
        self.tmp.cleanup()

    def run_auth(self):
        return authorize(self.client, self.output, 'teacher@example.edu',
                         flow_factory=self.factory, get_account=self.account)

    def test_valid_account_private_credentials_and_local_callback(self):
        self.assertEqual(self.run_auth()['status'], 'OK')
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o600)
        data = json.loads(self.output.read_text())
        self.assertEqual(data['type'], 'authorized_user')
        self.assertEqual(data['scopes'], [READ_SCOPE])
        self.assertEqual(data['refresh_token'], 'dummy-refresh')
        options = self.flow.run_local_server.call_args.kwargs
        self.assertEqual((options['host'], options['port']), ('127.0.0.1', 0))
        self.assertNotIn('{url}', options['authorization_prompt_message'])

    def test_wrong_account_never_saves(self):
        self.account.return_value = 'personal@example.net'
        with self.assertRaises(SetupError): self.run_auth()
        self.assertFalse(self.output.exists())

    def test_manage_mode_requires_exact_explicit_scopes(self):
        self.credentials.granted_scopes = MANAGE_SCOPES
        result = authorize(self.client, self.output, 'teacher@example.edu', access='manage',
                           flow_factory=self.factory, get_account=self.account)
        self.assertEqual(result['access'], 'drive.manage')
        self.assertEqual(json.loads(self.output.read_text())['scopes'], MANAGE_SCOPES)
        self.factory.assert_called_once_with(CLIENT, scopes=MANAGE_SCOPES)
        self.assertNotIn('https://www.googleapis.com/auth/drive', MANAGE_SCOPES)

    def test_manage_partial_consent_does_not_save(self):
        with self.assertRaises(SetupError):
            authorize(self.client, self.output, 'teacher@example.edu', access='manage',
                      flow_factory=self.factory, get_account=self.account)
        self.assertFalse(self.output.exists())

    def test_missing_refresh_or_extra_scope_never_saves(self):
        for token, scopes in [(None, [READ_SCOPE]), ('dummy', []), ('dummy', [READ_SCOPE, 'other'])]:
            with self.subTest(scopes=scopes, token=token):
                self.credentials.refresh_token, self.credentials.granted_scopes = token, scopes
                with self.assertRaises(SetupError): self.run_auth()
                self.assertFalse(self.output.exists())

    def test_existing_output_not_overwritten_or_browser_opened(self):
        self.output.write_text('original')
        with self.assertRaises(SetupError): self.run_auth()
        self.assertEqual(self.output.read_text(), 'original')
        self.factory.assert_not_called()

    def test_output_created_during_consent_is_preserved(self):
        def account(_):
            self.output.write_text('other-process')
            return 'teacher@example.edu'
        self.account.side_effect = account
        with self.assertRaises(SetupError): self.run_auth()
        self.assertEqual(self.output.read_text(), 'other-process')

    def test_git_and_symlink_destinations_rejected(self):
        original = self.root / 'existing.json'
        original.write_text('preserve')
        self.output.symlink_to(original)
        with self.assertRaises(SetupError): self.run_auth()
        self.output.unlink()
        (self.root / '.git').write_text('gitdir: elsewhere')
        with self.assertRaises(SetupError): self.run_auth()
        self.factory.assert_not_called()
        self.assertEqual(original.read_text(), 'preserve')

    def test_public_directory_rejected_without_chmod(self):
        self.root.chmod(0o755)
        with self.assertRaises(SetupError): self.run_auth()
        self.assertEqual(self.root.stat().st_mode & 0o777, 0o755)
        self.factory.assert_not_called()

    def test_web_client_or_non_google_endpoint_rejected(self):
        for key, value in [('auth_uri', 'https://example.org/auth'), ('token_uri', 'https://example.org/token')]:
            data = copy.deepcopy(CLIENT)
            data['installed'][key] = value
            self.client.write_text(json.dumps(data))
            with self.assertRaises(SetupError): load_client(self.client)
        self.client.write_text(json.dumps({'web': CLIENT['installed']}))
        with self.assertRaises(SetupError): load_client(self.client)

    def test_cli_does_not_print_sdk_exception_secrets(self):
        out, err = io.StringIO(), io.StringIO()
        with patch('authorize_drive.authorize', side_effect=RuntimeError('dummy-secret-url')), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = main(['--client-secrets', str(self.client), '--output', str(self.output),
                         '--expected-account', 'teacher@example.edu'])
        self.assertEqual(code, 1)
        self.assertNotIn('dummy-secret', out.getvalue() + err.getvalue())


if __name__ == '__main__':
    unittest.main()

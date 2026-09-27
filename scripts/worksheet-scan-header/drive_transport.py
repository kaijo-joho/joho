"""Drive transport for immutable scan artifacts. No permission changes or deletes."""
import hashlib
import json
from pathlib import Path
import re

DRIVE_FIELDS = 'id,mimeType,size,md5Checksum,parents,trashed,properties'


def drive_id(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{10,200}', value):
        raise ValueError('Invalid Drive ID')
    return value


def file_description(path, root, mime_type):
    path, root = Path(path).resolve(), Path(root).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError('Artifact must be a regular file inside the queue')
    with path.open('rb') as stream:
        md5 = hashlib.file_digest(stream, 'md5').hexdigest()
    with path.open('rb') as stream:
        sha256 = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {'path': str(path.relative_to(root)), 'size': path.stat().st_size,
            'md5': md5, 'sha256': sha256, 'mimeType': mime_type}


def public_description(description):
    return {k: description[k] for k in ('fileId', 'size', 'md5', 'sha256', 'mimeType')}


class DriveTransport:
    def __init__(self, service, media_factory):
        self.service, self.media_factory = service, media_factory

    @classmethod
    def from_credentials_file(cls, path):
        # Credentials are explicitly supplied; never reuse clasp/connector credentials.
        from google.oauth2.credentials import Credentials
        from google_auth_httplib2 import AuthorizedHttp
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
        import httplib2
        path = Path(path).expanduser().resolve()
        if any((p / '.git').exists() for p in path.parents):
            raise ValueError('Credentials must be outside Git repositories')
        data = json.loads(path.read_text())
        if data.get('type', 'authorized_user') != 'authorized_user':
            raise ValueError('Use explicitly authorized OAuth user credentials')
        credentials = Credentials.from_authorized_user_info(data)
        http = AuthorizedHttp(credentials, http=httplib2.Http(timeout=60))
        return cls(build('drive', 'v3', http=http, cache_discovery=False), MediaFileUpload)

    def check_folder(self, folder_id):
        folder_id = drive_id(folder_id)
        item = self.service.files().get(fileId=folder_id, supportsAllDrives=True,
            fields='id,mimeType,trashed,capabilities(canAddChildren)').execute()
        if item.get('trashed') or item.get('mimeType') != 'application/vnd.google-apps.folder' or not item.get('capabilities', {}).get('canAddChildren'):
            raise ValueError('Drive destination must be a writable folder')
        # Scan folders must not expose all pupils' originals through inheritance.
        token = None
        while True:
            args = {'fileId': folder_id, 'supportsAllDrives': True,
                    'fields': 'nextPageToken,permissions(type)', 'pageSize': 100}
            if token:
                args['pageToken'] = token
            page = self.service.permissions().list(**args).execute()
            if 'permissions' not in page or any(p.get('type') != 'user' for p in page['permissions']):
                raise ValueError('Use private scan folders shared only with specified staff users')
            token = page.get('nextPageToken')
            if not token:
                break

    def reserve_ids(self, count):
        ids = self.service.files().generateIds(count=count, space='drive', type='files').execute()['ids']
        if len(ids) != count or len(set(ids)) != count:
            raise ValueError('Drive did not return unique reserved IDs')
        return [drive_id(value) for value in ids]

    def get(self, file_id):
        try:
            return self.service.files().get(fileId=drive_id(file_id), supportsAllDrives=True, fields=DRIVE_FIELDS).execute()
        except Exception as error:
            if getattr(getattr(error, 'resp', None), 'status', None) == 404:
                return None
            raise

    @staticmethod
    def verify(remote, description, folder_id, receipt_id, role):
        expected = {'worksheetReceipt': receipt_id, 'worksheetRole': role}
        if (not remote or remote.get('id') != description['fileId'] or remote.get('trashed')
                or remote.get('mimeType') != description['mimeType']
                or str(remote.get('size')) != str(description['size'])
                or remote.get('md5Checksum') != description['md5']
                or remote.get('parents') != [folder_id]
                or any(remote.get('properties', {}).get(k) != v for k, v in expected.items())):
            raise ValueError('Drive artifact verification failed; existing files are never overwritten')

    def upload(self, description, root, folder_id, receipt_id, role):
        path = Path(root) / description['path']
        current = file_description(path, root, description['mimeType'])
        if any(current[k] != description[k] for k in current):
            raise ValueError('Local artifact changed after preparation')
        remote = self.get(description['fileId'])
        if remote is None:
            metadata = {'id': description['fileId'], 'name': receipt_id + '-' + role + path.suffix,
                        'parents': [folder_id], 'mimeType': description['mimeType'],
                        'properties': {'worksheetReceipt': receipt_id, 'worksheetRole': role}}
            media = self.media_factory(str(path), mimetype=description['mimeType'],
                                       chunksize=8 * 1024 * 1024, resumable=True)
            try:
                request = self.service.files().create(body=metadata, media_body=media,
                    supportsAllDrives=True, fields=DRIVE_FIELDS)
                response = None
                while response is None:
                    _, response = request.next_chunk(num_retries=3)
            except Exception as error:
                # A lost response can leave a completed file. The reserved ID makes
                # the next invocation safe, including a 409 on repeated create.
                if getattr(getattr(error, 'resp', None), 'status', None) != 409:
                    raise
            remote = self.get(description['fileId'])
        self.verify(remote, description, folder_id, receipt_id, role)
        return description['fileId']

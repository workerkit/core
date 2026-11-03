import { afterEach, expect, it, vi } from 'vitest';
import { request } from 'undici';
import { FileUploadError, MAX_INPUT_FILES, byName, executeTool, uploadWorkerFile, type WorkerKitClient } from '../src/index.js';

vi.mock('undici', async original => ({ ...await original<typeof import('undici')>(), request: vi.fn() }));
afterEach(() => vi.clearAllMocks());
const id = '11111111-2222-3333-4444-555555555555';
const headers = { 'Content-Type': 'application/pdf', 'x-goog-if-generation-match': '0', 'x-goog-content-length-range': '3,3' };
const file = { name: 'invoice.pdf', contentType: 'application/pdf', bytes: new Uint8Array([1, 2, 3]) };
function client(url = 'https://storage.googleapis.com/private/object?signed=secret') {
  return { post: vi.fn().mockResolvedValueOnce({ status: 200, data: { fileId: id, uploadUrl: url, headers } })
    .mockResolvedValueOnce({ status: 200, data: { status: 'ready' } }), delete: vi.fn().mockResolvedValue({ status: 204 }) };
}

it('uploads opaque bytes with signed headers only and returns an opaque file reference', async () => {
  const api = client();
  const destroy = vi.fn();
  vi.mocked(request).mockResolvedValue({ statusCode: 200, body: { destroy } } as never);
  const result = await uploadWorkerFile(api as unknown as WorkerKitClient, 'manager-secret', 1, file);
  expect(result).toEqual({ kind: 'file', fileId: id });
  const options = vi.mocked(request).mock.calls[0]![1]!;
  expect(options.headers).toEqual(headers);
  expect(options.body).toBe(file.bytes);
  expect(JSON.stringify(options.headers)).not.toContain('manager-secret');
  expect(destroy).toHaveBeenCalledOnce();
  expect(api.post).toHaveBeenLastCalledWith(`/api/manage/workers/1/files/${id}/finalize`, expect.anything());
});

it.each(['http://storage.googleapis.com/x', 'https://evil.example/x', 'https://storage.googleapis.com.evil.example/x', 'https://user:pass@storage.googleapis.com/x'])
('refuses unsafe storage destination %s and revokes the reservation', async url => {
  const api = client(url);
  await expect(uploadWorkerFile(api as unknown as WorkerKitClient, 'key', 1, file)).rejects.toThrow('invalid_upload_destination');
  expect(request).not.toHaveBeenCalled();
  expect(api.delete).toHaveBeenCalledOnce();
});

it('never finalizes a redirect or echoes a signed capability in an error', async () => {
  const api = client();
  vi.mocked(request).mockResolvedValue({ statusCode: 307, body: { destroy: vi.fn() } } as never);
  await expect(uploadWorkerFile(api as unknown as WorkerKitClient, 'key', 1, file)).rejects.toThrow('file_upload_failed');
  expect(api.post).toHaveBeenCalledOnce();
  expect(api.delete).toHaveBeenCalledOnce();
});

it('keeps the typed inputs in the run body and idempotency only in its header', async () => {
  const post = vi.fn().mockResolvedValue({ status: 200, data: { runId: id } });
  await executeTool({ post } as unknown as WorkerKitClient, byName('worker_run')!,
    { tokenId: 1, prompt: 'Process', inputs: [{ kind: 'file', fileId: id }], idempotencyKey: 'stable-key' }, { token: 'key' });
  expect(post.mock.calls[0]![1].body.inputs).toEqual([{ kind: 'file', fileId: id }]);
  expect(post.mock.calls[0]![1].body).not.toHaveProperty('idempotencyKey');
  expect(post.mock.calls[0]![1].headers).toEqual({ 'Idempotency-Key': 'stable-key' });
});

it.each([{ kind: 'json', value: {} }, { kind: 'file', fileId: id, url: 'https://example.com' }])
('rejects unimplemented input shapes before HTTP', async input => {
  const post = vi.fn();
  await expect(executeTool({ post } as unknown as WorkerKitClient, byName('worker_run')!, { tokenId: 1, inputs: [input] })).rejects.toThrow();
  expect(post).not.toHaveBeenCalled();
});

it('reports the API refusal when a reservation is refused, without any storage request', async () => {
  const api = { post: vi.fn().mockResolvedValueOnce({ status: 409, data: { error: 'file_storage_not_configured', message: 'Setup required: configure private file storage before uploading.' } }), delete: vi.fn() };
  const failure = (await uploadWorkerFile(api as unknown as WorkerKitClient, 'key', 1, file).catch((error: unknown) => error)) as FileUploadError;
  expect(failure).toBeInstanceOf(FileUploadError);
  expect(failure.code).toBe('file_prepare_failed');
  expect(failure.upstream).toEqual({ status: 409, error: 'file_storage_not_configured', message: 'Setup required: configure private file storage before uploading.' });
  expect(request).not.toHaveBeenCalled();
  expect(api.delete).not.toHaveBeenCalled();
});

it('revokes an upload the API could not finalize and reports its failure code', async () => {
  const api = {
    post: vi.fn().mockResolvedValueOnce({ status: 200, data: { fileId: id, uploadUrl: 'https://storage.googleapis.com/private/object?signed=secret', headers } })
      .mockResolvedValueOnce({ status: 200, data: { fileId: id, status: 'failed', failureCode: 'size_mismatch' } }),
    delete: vi.fn().mockResolvedValue({ status: 204 }),
  };
  vi.mocked(request).mockResolvedValue({ statusCode: 200, body: { destroy: vi.fn() } } as never);
  const failure = (await uploadWorkerFile(api as unknown as WorkerKitClient, 'key', 1, file).catch((error: unknown) => error)) as FileUploadError;
  expect(failure.code).toBe('file_finalize_failed');
  expect(failure.upstream).toEqual({ status: 200, error: 'size_mismatch' });
  expect(api.delete).toHaveBeenCalledExactlyOnceWith(`/api/manage/workers/1/files/${id}`, { token: 'key' });
});

it('rejects more files than a run accepts before HTTP', async () => {
  expect(MAX_INPUT_FILES).toBe(3);
  const post = vi.fn();
  const inputs = Array.from({ length: 4 }, () => ({ kind: 'file', fileId: id }));
  await expect(executeTool({ post } as unknown as WorkerKitClient, byName('worker_run')!, { tokenId: 1, inputs, idempotencyKey: 'stable-key' })).rejects.toThrow();
  expect(post).not.toHaveBeenCalled();
});
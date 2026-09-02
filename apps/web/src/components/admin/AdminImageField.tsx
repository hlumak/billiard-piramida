import { useRef, useState } from 'react';
import { Button, Input, Label, TextField } from '@heroui/react';
import { useMutation } from '@tanstack/react-query';
import { Download, Upload } from 'lucide-react';
import { isSafeUrl } from '@repo/shared';
import { adminApi } from '../../lib/admin-api';
import { ApiError, resolveAssetUrl } from '../../lib/api';
import { m } from '../../paraglide/messages.js';

/** Mirrors the API's cap; checked here too so a phone photo fails before it uploads. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif';

function uploadErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'file_too_large') return m.admin_image_too_large();
    if (err.code === 'unsupported_image') return m.admin_unsupported_image();
  }
  return m.admin_upload_failed();
}

function importErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'invalid_url') return m.admin_invalid_url();
    if (err.code === 'no_image_found') return m.admin_import_no_image();
    if (err.code === 'unsupported_image') return m.admin_unsupported_image();
  }
  return m.admin_import_failed();
}

interface Props {
  /** Current image URL (app-relative or absolute); '' when there is none. */
  value: string;
  onChange: (url: string) => void;
}

/**
 * Picture picker for admin cards. Three ways in, all ending in the same URL
 * string the parent stores: upload a file, pull the picture from a social post
 * by its link, or paste a URL by hand (the original field, kept for hosted
 * pictures). Nothing is written to the card until the parent saves.
 */
export function AdminImageField({ value, onChange }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [postUrl, setPostUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: (file: File) => adminApi.uploadImage(file),
    onMutate: () => setError(null),
    onSuccess: ({ url }) => onChange(url),
    onError: err => setError(uploadErrorMessage(err))
  });

  const importPost = useMutation({
    mutationFn: (url: string) => adminApi.importPostImage(url),
    onMutate: () => setError(null),
    onSuccess: ({ url }) => {
      onChange(url);
      setPostUrl('');
    },
    onError: err => setError(importErrorMessage(err))
  });

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setError(m.admin_image_too_large());
      return;
    }
    upload.mutate(file);
  };

  const trimmedPost = postUrl.trim();
  const canImport = /^https?:\/\/\S+$/i.test(trimmedPost) && !importPost.isPending;
  const preview = value.trim() !== '' && isSafeUrl(value.trim()) ? value.trim() : null;
  const busy = upload.isPending || importPost.isPending;

  return (
    <div className="flex flex-col gap-3 rounded-[10px] bg-club-green p-3">
      <p className="text-xs font-bold uppercase text-golden">{m.admin_image_label()}</p>

      {preview ? (
        // Decorative: the fields around it say what it is
        <img
          src={resolveAssetUrl(preview)}
          alt=""
          className="h-32 w-full rounded-[10px] bg-club-green-light object-cover"
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {/* The native picker is triggered from a styled button; the input itself stays hidden */}
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={event => {
            pickFile(event.currentTarget.files?.[0]);
            // Picking the same file again must fire change again
            event.currentTarget.value = '';
          }}
        />
        <Button
          size="sm"
          variant="outline"
          className="border-golden text-creme"
          isPending={upload.isPending}
          isDisabled={busy}
          onPress={() => fileInput.current?.click()}
        >
          <Upload className="size-4" aria-hidden />
          {preview ? m.admin_replace_image() : m.admin_upload_image()}
        </Button>
        {preview ? (
          <Button size="sm" variant="ghost" isDisabled={busy} onPress={() => onChange('')}>
            {m.admin_remove_image()}
          </Button>
        ) : null}
        <span className="text-xs text-grey-cool">{m.admin_image_hint()}</span>
      </div>

      <TextField name="postUrl" value={postUrl} onChange={setPostUrl}>
        <Label>{m.admin_image_from_post()}</Label>
        <div className="flex gap-2">
          <Input inputMode="url" placeholder={m.admin_post_url_placeholder()} className="flex-1" />
          <Button
            size="sm"
            className="shrink-0 font-semibold"
            isDisabled={!canImport || busy}
            isPending={importPost.isPending}
            onPress={() => importPost.mutate(trimmedPost)}
          >
            <Download className="size-4" aria-hidden />
            {m.admin_import_btn()}
          </Button>
        </div>
      </TextField>

      <TextField name="imageUrl" value={value} onChange={onChange}>
        <Label>{m.admin_or_paste_image_url()}</Label>
        <Input inputMode="url" placeholder="/news/tournament.webp" />
      </TextField>

      {error ? <p className="text-sm text-danger-soft-foreground">{error}</p> : null}
    </div>
  );
}

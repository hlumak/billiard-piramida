import { useState } from 'react';
import { Button, FieldError, Input, Label, TextField } from '@heroui/react';
import { useMutation } from '@tanstack/react-query';
import { adminApi } from '../../lib/admin-api';
import { ApiError } from '../../lib/api';
import { m } from '../../paraglide/messages.js';

export function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [token, setToken] = useState('');

  const login = useMutation({
    // Exchanges the token for an HttpOnly session cookie (nothing stored in JS)
    mutationFn: (candidate: string) => adminApi.session(candidate),
    onSuccess: () => onSuccess()
  });

  // Only a 401 means the key is wrong: rate limiting, a disabled admin panel or
  // a network failure used to read "Invalid access key" too, and staff kept
  // retyping straight into the lockout
  const error = login.error;
  const errorText =
    error instanceof ApiError && error.status === 401
      ? m.admin_bad_token()
      : error instanceof ApiError && error.status === 429
        ? m.err_rate_limited()
        : error instanceof ApiError && error.status === 503
          ? m.admin_disabled()
          : m.err_generic();

  return (
    <form
      className="card fields-roomy anim-reveal mx-auto flex w-full max-w-md flex-col gap-4.5 rounded-3xl p-6 md:p-7.5"
      onSubmit={event => {
        event.preventDefault();
        event.stopPropagation();
        if (token.trim()) login.mutate(token.trim());
      }}
    >
      <h2 className="text-[22px] font-bold">{m.admin_login_title()}</h2>
      <TextField
        name="adminToken"
        type="password"
        value={token}
        onChange={value => {
          setToken(value);
          // A stale error keeps the field invalid and blocks native form resubmission
          login.reset();
        }}
        isInvalid={login.isError}
      >
        <Label>{m.admin_token_label()}</Label>
        <Input autoComplete="current-password" />
        <FieldError>{errorText}</FieldError>
      </TextField>
      <Button
        type="submit"
        size="lg"
        className="btn-gold mt-1.5 h-14 w-full text-base"
        isDisabled={token.trim().length === 0}
        isPending={login.isPending}
      >
        {m.admin_login_btn()}
      </Button>
    </form>
  );
}

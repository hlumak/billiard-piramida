import { useState } from 'react';
import { Button, FieldError, Input, Label, TextField } from '@heroui/react';
import { useMutation } from '@tanstack/react-query';
import { adminApi } from '../../lib/admin-api';
import { m } from '../../paraglide/messages.js';

export function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [token, setToken] = useState('');

  const login = useMutation({
    // Exchanges the token for an HttpOnly session cookie (nothing stored in JS)
    mutationFn: (candidate: string) => adminApi.session(candidate),
    onSuccess: () => onSuccess()
  });

  return (
    <form
      className="anim-reveal mx-auto mt-16 flex w-full max-w-sm flex-col gap-4"
      onSubmit={event => {
        event.preventDefault();
        event.stopPropagation();
        if (token.trim()) login.mutate(token.trim());
      }}
    >
      <h2 className="text-xl font-semibold text-creme">{m.admin_login_title()}</h2>
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
        <FieldError>{m.admin_bad_token()}</FieldError>
      </TextField>
      <Button
        type="submit"
        size="lg"
        className="h-[45px] w-full text-lg font-bold"
        isDisabled={token.trim().length === 0}
        isPending={login.isPending}
      >
        {m.admin_login_btn()}
      </Button>
    </form>
  );
}

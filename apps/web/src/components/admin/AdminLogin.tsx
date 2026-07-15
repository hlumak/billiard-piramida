import { useState } from 'react';
import { Button, FieldError, Input, Label, TextField } from '@heroui/react';
import { useMutation } from '@tanstack/react-query';
import { adminApi, storeAdminToken } from '../../lib/admin-api';
import { m as motion } from '../motion';
import { m } from '../../paraglide/messages.js';

export function AdminLogin({ onSuccess }: { onSuccess: (token: string) => void }) {
  const [token, setToken] = useState('');

  const login = useMutation({
    // Verifying the token = making any authenticated call
    mutationFn: async (candidate: string) => {
      await adminApi.stats(candidate);
      return candidate;
    },
    onSuccess: verified => {
      storeAdminToken(verified);
      onSuccess(verified);
    }
  });

  return (
    <motion.form
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="mx-auto mt-16 flex w-full max-w-sm flex-col gap-4"
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
    </motion.form>
  );
}

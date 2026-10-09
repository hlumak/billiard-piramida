import { ApiError } from '../../lib/api';
import { m } from '../../paraglide/messages.js';

/** What went wrong with a picture upload, in the staff member's language. */
export function uploadErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'file_too_large') return m.admin_image_too_large();
    if (err.code === 'unsupported_image') return m.admin_unsupported_image();
  }
  return m.admin_upload_failed();
}

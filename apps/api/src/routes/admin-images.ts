import multipart from '@fastify/multipart';
import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { ERROR_RESPONSE, UPLOADED_IMAGE_RESPONSE } from '../lib/schemas.ts';
import { MAX_IMAGE_BYTES, UnsupportedImageError } from '../services/images.ts';
import { importPostImage, PostImageError, type PostImageFailure } from '../services/post-image.ts';

/** Each importer failure has one HTTP shape so the modal can word its hint. */
const IMPORT_FAILURE_STATUS: Record<PostImageFailure, number> = {
  invalid_url: 422,
  no_image_found: 404,
  unsupported_image: 415,
  import_failed: 502
};

function isFileTooLarge(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'FST_REQ_FILE_TOO_LARGE';
}

/**
 * Pictures for news cards: a direct upload, or an import from a social post.
 * Registered inside the admin scope (token hook inherited); the multipart
 * parser is registered here, in this child context, so no public route ever
 * accepts multipart bodies.
 */
export const adminImageRoutes: FastifyPluginAsyncTypebox = async admin => {
  await admin.register(multipart, {
    limits: { files: 1, fields: 2, parts: 3, fileSize: MAX_IMAGE_BYTES, fieldSize: 1024 },
    // Default is to truncate silently and hand over a cropped file
    throwFileSizeLimit: true
  });

  admin.post(
    '/api/admin/images',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { response: { 201: UPLOADED_IMAGE_RESPONSE, '4xx': ERROR_RESPONSE } }
    },
    async (request, reply) => {
      if (!request.isMultipart()) return reply.code(415).send({ error: 'expected_multipart' });
      const part = await request.file();
      if (!part) return reply.code(400).send({ error: 'no_file' });

      let bytes: Buffer;
      try {
        bytes = await part.toBuffer();
      } catch (err) {
        if (isFileTooLarge(err)) return reply.code(413).send({ error: 'file_too_large' });
        throw err;
      }
      if (bytes.length === 0) return reply.code(400).send({ error: 'no_file' });

      try {
        const url = await admin.images.save(bytes);
        return reply.code(201).send({ url });
      } catch (err) {
        if (err instanceof UnsupportedImageError) {
          return reply.code(415).send({ error: 'unsupported_image' });
        }
        throw err;
      }
    }
  );

  admin.post(
    '/api/admin/images/from-post',
    {
      // Each call is up to three outbound fetches on the club's behalf
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        body: Type.Object(
          { url: Type.String({ minLength: 1, maxLength: 2000 }) },
          { additionalProperties: false }
        ),
        response: { 200: UPLOADED_IMAGE_RESPONSE, '4xx': ERROR_RESPONSE, '5xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      try {
        const url = await importPostImage(request.body.url, admin.images, {
          oembedToken: admin.oembedToken ?? undefined
        });
        return { url };
      } catch (err) {
        if (err instanceof PostImageError) {
          // Expected often enough (login walls, deleted posts) to stay at info
          request.log.info({ err, post: request.body.url }, 'post image import failed');
          return reply.code(IMPORT_FAILURE_STATUS[err.code]).send({ error: err.code });
        }
        throw err;
      }
    }
  );
};

import { Button, Spinner } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminNewsItemDto } from '@repo/shared';
import { adminApi, adminNewsQuery } from '../../lib/admin-api';
import { m } from '../../paraglide/messages.js';
import { QueryError } from '../QueryError';
import { StaggerGroup, StaggerItem } from '../motion';
import { AdminNewsModal } from './AdminNewsModal';

interface RowProps {
  item: AdminNewsItemDto;
  isFirst: boolean;
  isLast: boolean;
  isReordering: boolean;
  onMove: (delta: number) => void;
}

function NewsRow({ item, isFirst, isLast, isReordering, onMove }: RowProps) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'news'] });
    queryClient.invalidateQueries({ queryKey: ['news'] });
  };

  const update = useMutation({
    mutationFn: (patch: { isPublished: boolean }) => adminApi.updateNewsItem(item.id, patch),
    onSuccess: invalidate
  });

  const remove = useMutation({
    mutationFn: () => adminApi.deleteNewsItem(item.id),
    onSuccess: invalidate
  });

  return (
    <li
      className={`rounded-[10px] bg-club-green-light p-3 ${item.isPublished ? '' : 'opacity-60'}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-creme">{item.title}</p>
          {item.body ? <p className="truncate text-xs text-grey-cool">{item.body}</p> : null}
          {/* Where the card leads: its own page when it has an article, else the explicit link */}
          {item.hasArticle ? (
            <a
              href={`/news/${item.slug}`}
              target="_blank"
              rel="noreferrer"
              className="truncate text-xs text-golden hover:text-golden-hover"
            >
              /news/{item.slug}
            </a>
          ) : item.linkUrl ? (
            <p className="truncate text-xs text-grey-cool">{item.linkUrl}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Carousel order is the one thing staff retouch repeatedly, so it gets
              buttons on the row rather than a trip through the modal. */}
          <Button
            size="sm"
            variant="ghost"
            aria-label={m.admin_move_up()}
            isDisabled={isFirst}
            isPending={isReordering}
            onPress={() => onMove(-1)}
          >
            ↑
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={m.admin_move_down()}
            isDisabled={isLast}
            isPending={isReordering}
            onPress={() => onMove(1)}
          >
            ↓
          </Button>
          <Button
            size="sm"
            variant={item.isPublished ? 'outline' : 'primary'}
            className={item.isPublished ? 'border-golden text-creme' : ''}
            isPending={update.isPending}
            onPress={() => update.mutate({ isPublished: !item.isPublished })}
          >
            {item.isPublished ? m.admin_published() : m.admin_hidden()}
          </Button>
          <AdminNewsModal item={item} />
          <Button
            size="sm"
            variant="danger-soft"
            isPending={remove.isPending}
            onPress={() => {
              if (window.confirm(m.admin_delete_news_confirm())) remove.mutate();
            }}
          >
            {m.admin_delete_btn()}
          </Button>
        </div>
      </div>
    </li>
  );
}

export function AdminNews() {
  const queryClient = useQueryClient();
  const { data: items, isPending, isError, refetch } = useQuery(adminNewsQuery());

  // ±1 on a single row would only create ties (which the API breaks by date, not
  // by intent), so a move renumbers positions to indexes and writes just the
  // rows whose number actually changed — a no-op for an already-tidy list.
  const reorder = useMutation({
    mutationFn: async ({ from, to }: { from: number; to: number }) => {
      const next = [...(items ?? [])];
      const [moved] = next.splice(from, 1);
      if (!moved) return;
      next.splice(to, 0, moved);
      // flatMap in one pass so `index` stays the target position — filtering
      // first and mapping after would renumber against the filtered array.
      await Promise.all(
        next.flatMap((item, index) =>
          item.sortOrder === index ? [] : [adminApi.updateNewsItem(item.id, { sortOrder: index })]
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'news'] });
      queryClient.invalidateQueries({ queryKey: ['news'] });
    }
  });

  if (isError) return <QueryError onRetry={() => refetch()} />;
  if (isPending || !items) {
    return (
      <div className="flex justify-center py-16">
        <Spinner aria-label={m.loading()} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <AdminNewsModal item={null} />
      </div>
      {items.length === 0 ? (
        <p className="py-8 text-center text-grey-cool">{m.admin_no_news()}</p>
      ) : (
        <StaggerGroup>
          <ul className="flex flex-col gap-2">
            {items.map((item, index) => (
              <StaggerItem key={item.id}>
                <NewsRow
                  item={item}
                  isFirst={index === 0}
                  isLast={index === items.length - 1}
                  isReordering={reorder.isPending}
                  onMove={delta => reorder.mutate({ from: index, to: index + delta })}
                />
              </StaggerItem>
            ))}
          </ul>
        </StaggerGroup>
      )}
    </div>
  );
}

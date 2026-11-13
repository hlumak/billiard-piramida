import { useState, type ReactNode } from 'react';
import { Button, Modal } from '@heroui/react';
import { m } from '../../paraglide/messages.js';

interface ConfirmActionProps {
  /** The question, e.g. "Delete this dish?" */
  title: string;
  /** What happens next, when the title alone does not say it */
  text?: string;
  /** Names the action on the button, e.g. "Delete dish" — never a bare "OK" */
  confirmLabel: string;
  /** Destructive actions get the red button; reversible ones the gold */
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  /** The row's own button; call `open` from its press instead of acting */
  children: (open: () => void) => ReactNode;
}

/**
 * The staff panel's "are you sure" step, in the panel's own look and
 * language. It replaced window.confirm, whose OK / Cancel buttons named no
 * action and came in the browser's language and style.
 */
export function ConfirmAction({
  title,
  text,
  confirmLabel,
  tone = 'danger',
  onConfirm,
  children
}: ConfirmActionProps) {
  const [isOpen, setOpen] = useState(false);
  // Built on the first open and kept (for the closing animation): a list row
  // per booking or dish each mounted a closed modal it might never show
  const [built, setBuilt] = useState(false);
  return (
    <>
      {children(() => {
        setBuilt(true);
        setOpen(true);
      })}
      {/* Controlled on the backdrop, not through Modal (React Aria's
          DialogTrigger): the row buttons that open it are plain <button>s,
          which DialogTrigger does not count as its trigger and warns about */}
      {built ? (
        <Modal.Backdrop isOpen={isOpen} onOpenChange={setOpen}>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-100">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>{title}</Modal.Heading>
              </Modal.Header>
              {text ? (
                <Modal.Body>
                  <p className="text-cream-soft">{text}</p>
                </Modal.Body>
              ) : null}
              <Modal.Footer>
                <Button variant="ghost" slot="close">
                  {m.btn_back()}
                </Button>
                <Button
                  variant={tone}
                  className={tone === 'primary' ? 'btn-gold' : ''}
                  onPress={() => {
                    setOpen(false);
                    onConfirm();
                  }}
                >
                  {confirmLabel}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      ) : null}
    </>
  );
}

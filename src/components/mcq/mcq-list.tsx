"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type McqListQuestion = {
  id: string;
  name: string;
  question: string;
};

function ActionsMenu({
  question,
  anchor,
  onClose,
  onDelete,
}: {
  question: McqListQuestion;
  anchor: HTMLElement;
  onClose: () => void;
  onDelete: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    function place() {
      const rect = anchor.getBoundingClientRect();
      setStyle({
        position: "fixed",
        top: rect.bottom + 4,
        right: Math.max(8, window.innerWidth - rect.right),
        zIndex: 50,
      });
    }

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (anchor.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      onClose();
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={style}
      className="min-w-36 rounded-lg bg-popover p-1 shadow-md ring-1 ring-foreground/10"
    >
      <Link
        role="menuitem"
        href={`/home/mcqs/${question.id}/edit`}
        className="block rounded-md px-2 py-1.5 text-sm hover:bg-accent"
      >
        Edit
      </Link>
      <Link
        role="menuitem"
        href={`/home/mcqs/${question.id}/preview`}
        className="block rounded-md px-2 py-1.5 text-sm hover:bg-accent"
      >
        Preview
      </Link>
      <button
        type="button"
        role="menuitem"
        className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
        onClick={onDelete}
      >
        Delete
      </button>
    </div>,
    document.body,
  );
}

export function McqList({ questions }: { questions: McqListQuestion[] }) {
  const router = useRouter();
  const [items, setItems] = useState(questions);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [pendingDelete, setPendingDelete] = useState<McqListQuestion | null>(null);

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }

    const response = await fetch(`/api/mcqs/${pendingDelete.id}`, {
      method: "DELETE",
    });
    if (response.ok) {
      setItems((current) => current.filter((item) => item.id !== pendingDelete.id));
      router.refresh();
    }
    setPendingDelete(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Link href="/home/mcqs/new" className={buttonVariants()}>
          Create question
        </Link>
      </div>

      {items.length === 0 ? (
        <p>No questions yet. Create your first multiple-choice question.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Question</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((question) => (
              <TableRow key={question.id}>
                <TableCell>{question.name}</TableCell>
                <TableCell className="max-w-md truncate">{question.question}</TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Actions for ${question.name}`}
                    aria-expanded={openMenuId === question.id}
                    aria-haspopup="menu"
                    onClick={(event) => {
                      if (openMenuId === question.id) {
                        setOpenMenuId(null);
                        setMenuAnchor(null);
                        return;
                      }
                      setOpenMenuId(question.id);
                      setMenuAnchor(event.currentTarget);
                    }}
                  >
                    <MoreVertical />
                  </Button>
                  {openMenuId === question.id && menuAnchor ? (
                    <ActionsMenu
                      question={question}
                      anchor={menuAnchor}
                      onClose={() => {
                        setOpenMenuId(null);
                        setMenuAnchor(null);
                      }}
                      onDelete={() => {
                        setOpenMenuId(null);
                        setMenuAnchor(null);
                        setPendingDelete(question);
                      }}
                    />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this question?</DialogTitle>
            <DialogDescription>
              This permanently removes the question, its choices, and its attempts.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

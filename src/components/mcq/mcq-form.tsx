"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type FormChoice = {
  key: string;
  text: string;
};

export type McqFormQuestion = {
  id: string;
  name: string;
  question: string;
  choices: Array<{
    id: string;
    text: string;
    isCorrect: boolean;
    position: number;
  }>;
};

function newChoice(): FormChoice {
  return { key: crypto.randomUUID(), text: "" };
}

export function McqForm({ question }: { question?: McqFormQuestion }) {
  const router = useRouter();
  const [name, setName] = useState(question?.name ?? "");
  const [questionText, setQuestionText] = useState(question?.question ?? "");
  const [choices, setChoices] = useState<FormChoice[]>(() => {
    if (!question) {
      return [newChoice(), newChoice()];
    }
    return [...question.choices]
      .sort((left, right) => left.position - right.position)
      .map((choice) => ({ key: choice.id, text: choice.text }));
  });
  const [correctKey, setCorrectKey] = useState<string | null>(
    question?.choices.find((choice) => choice.isCorrect)?.id ?? null,
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function removeChoice(key: string) {
    if (choices.length <= 2) {
      return;
    }
    setChoices((current) => current.filter((choice) => choice.key !== key));
    if (correctKey === key) {
      setCorrectKey(null);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    const trimmedQuestion = questionText.trim();
    const trimmedChoices = choices.map((choice) => ({
      ...choice,
      text: choice.text.trim(),
    }));

    if (!trimmedName || !trimmedQuestion || trimmedChoices.some((choice) => !choice.text)) {
      setError("Name, question, and every choice are required.");
      return;
    }

    if (!correctKey || !trimmedChoices.some((choice) => choice.key === correctKey)) {
      setError("Select exactly one correct answer.");
      return;
    }

    setError("");
    setSaving(true);

    const body = {
      name: trimmedName,
      question: trimmedQuestion,
      choices: trimmedChoices.map((choice) => ({
        text: choice.text,
        isCorrect: choice.key === correctKey,
      })),
    };

    const response = await fetch(question ? `/api/mcqs/${question.id}` : "/api/mcqs", {
      method: question ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      router.push("/home");
      return;
    }

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setError(payload?.error ?? "Unable to save question");
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{question ? "Edit question" : "Create question"}</CardTitle>
        <CardDescription>
          Two to six choices, with exactly one marked correct.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="mcq-name">Name</FieldLabel>
              <Input
                id="mcq-name"
                value={name}
                onValueChange={setName}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="mcq-question">Question</FieldLabel>
              <Textarea
                id="mcq-question"
                value={questionText}
                onChange={(event) => setQuestionText(event.target.value)}
              />
            </Field>
            {choices.map((choice, index) => (
              <Field key={choice.key} orientation="horizontal">
                <div className="flex w-full items-center gap-2">
                  <input
                    type="radio"
                    id={`mcq-correct-${choice.key}`}
                    name="correct-choice"
                    className="size-4 shrink-0"
                    checked={correctKey === choice.key}
                    onChange={() => setCorrectKey(choice.key)}
                    aria-label={`Mark choice ${index + 1} as correct`}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <FieldLabel htmlFor={`mcq-choice-${choice.key}`}>
                      Choice {index + 1}
                    </FieldLabel>
                    <Input
                      id={`mcq-choice-${choice.key}`}
                      value={choice.text}
                      onValueChange={(text) => {
                        setChoices((current) =>
                          current.map((item) =>
                            item.key === choice.key ? { ...item, text } : item,
                          ),
                        );
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={choices.length <= 2}
                    aria-label={`Remove choice ${index + 1}`}
                    onClick={() => removeChoice(choice.key)}
                  >
                    <Trash2 />
                    Remove
                  </Button>
                </div>
              </Field>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={choices.length >= 6}
              onClick={() => setChoices((current) => [...current, newChoice()])}
            >
              <Plus />
              Add choice
            </Button>
            {error ? <FieldError>{error}</FieldError> : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                Save
              </Button>
              <Link href="/home" className={buttonVariants({ variant: "outline" })}>
                Cancel
              </Link>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

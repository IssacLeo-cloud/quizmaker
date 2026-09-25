"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";

export type McqPreviewQuestion = {
  id: string;
  name: string;
  question: string;
  choices: Array<{
    id: string;
    text: string;
    position: number;
  }>;
};

export function McqPreview({ question }: { question: McqPreviewQuestion }) {
  const choices = [...question.choices].sort((left, right) => left.position - right.position);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    isCorrect: boolean;
    correctChoiceId: string;
  } | null>(null);

  async function submitAnswer() {
    if (!selectedId) {
      setError("Select an answer before submitting.");
      return;
    }

    setError("");
    const response = await fetch(`/api/mcqs/${question.id}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choiceId: selectedId }),
    });

    const payload = (await response.json().catch(() => null)) as {
      attempt?: { isCorrect: boolean };
      correctChoiceId?: string;
      error?: string;
    } | null;

    if (!response.ok || !payload?.correctChoiceId || !payload.attempt) {
      setError(payload?.error ?? "Unable to record attempt");
      return;
    }

    setResult({
      isCorrect: payload.attempt.isCorrect,
      correctChoiceId: payload.correctChoiceId,
    });
  }

  function tryAgain() {
    setSelectedId(null);
    setResult(null);
    setError("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{question.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p>{question.question}</p>
        <div className="flex flex-col gap-2">
          {choices.map((choice) => {
            const isCorrectChoice = result?.correctChoiceId === choice.id;
            return (
              <label
                key={choice.id}
                data-correct={isCorrectChoice ? "true" : undefined}
                className="flex items-center gap-2"
              >
                <input
                  type="radio"
                  name="preview-choice"
                  value={choice.id}
                  checked={selectedId === choice.id}
                  disabled={result !== null}
                  onChange={() => setSelectedId(choice.id)}
                />
                <span>{choice.text}</span>
                {result && !result.isCorrect && isCorrectChoice ? <span>Correct</span> : null}
              </label>
            );
          })}
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
        {result ? (
          <>
            <p>{result.isCorrect ? "Correct" : "Incorrect"}</p>
            <Button type="button" onClick={tryAgain}>
              Try again
            </Button>
          </>
        ) : (
          <Button type="button" onClick={submitAnswer}>
            Submit answer
          </Button>
        )}
        <div className="flex gap-4 text-sm">
          <Link href="/home">Back to home</Link>
          <Link href={`/home/mcqs/${question.id}/edit`}>Edit</Link>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect } from "react";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function LogoutPanel() {
  useEffect(() => {
    void fetch("/api/auth/logout", { method: "POST" });
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signed out</CardTitle>
        <CardDescription>
          You are signed out. There is no session to keep you logged in yet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/login">Log in</Link>
      </CardContent>
    </Card>
  );
}

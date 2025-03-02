"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  // Redirect to /chat on component mount
  useEffect(() => {
    router.replace("/chat");
  }, [router]);

  // Return null while redirecting
  return null;
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  // Redirect to /mentor on component mount
  useEffect(() => {
    router.replace("/mentor");
  }, [router]);

  // Return null while redirecting
  return null;
}

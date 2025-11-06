import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import { NavBar } from "@/components/NavBar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tutor360",
  description: "AI-powered learning platform with personalized mentorship",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} chakra-ui`}>
        <Providers>
          <NavBar />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}

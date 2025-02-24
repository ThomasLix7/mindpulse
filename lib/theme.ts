import { createSystem, defaultConfig } from "@chakra-ui/react";

export const system = createSystem(defaultConfig, {
  theme: {
    tokens: {
      fonts: {
        heading: { value: `'Figtree', sans-serif` },
        body: { value: `'Figtree', sans-serif` },
      },
    },
    semanticTokens: {
      colors: {
        background: { value: "var(--background)" },
        foreground: { value: "var(--foreground)" },
      },
    },
  },
});

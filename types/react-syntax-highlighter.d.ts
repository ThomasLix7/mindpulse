declare module "react-syntax-highlighter" {
  import { ReactNode } from "react";

  export const Prism: any;
  export const Light: any;
}

declare module "react-syntax-highlighter/dist/cjs/styles/prism" {
  const vscDarkPlus: any;
  const dracula: any;
  const okaidia: any;
  const solarizedlight: any;
  const tomorrow: any;

  export { vscDarkPlus, dracula, okaidia, solarizedlight, tomorrow };
}

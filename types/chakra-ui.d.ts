import { ComponentProps } from "react";

declare module "@chakra-ui/react" {
  export interface ButtonProps extends ComponentProps<"button"> {
    colorScheme?: string;
    variant?: string;
    size?: string;
    isLoading?: boolean;
    loadingText?: string;
    spinner?: React.ReactElement;
    spinnerPlacement?: "start" | "end";
    leftIcon?: React.ReactElement;
    rightIcon?: React.ReactElement;
    isDisabled?: boolean;
  }

  export function Button(props: ButtonProps): JSX.Element;
}

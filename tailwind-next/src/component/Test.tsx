const colorStyles = {
  red: "text-red-500",
  blue: "text-blue-500",
  green: "text-green-500",
  yellow: "text-yellow-500",
  purple: "text-purple-500",
};

const sizeStyles = {
  small: "text-xs",
  medium: "text-base",
  large: "text-xl",
  xlarge: "text-2xl",
};

const paddingStyles = {
  none: "p-0",
  small: "p-1",
  medium: "p-2",
  large: "p-4",
  xlarge: "p-6",
};

const borderRadiusStyles = {
  none: "rounded-none",
  small: "rounded-xs",
  medium: "rounded-sm",
  large: "rounded-lg",
  full: "rounded-full",
};

const backgroundStyles = {
  transparent: "bg-transparent",
  white: "bg-white",
  gray: "bg-gray-100",
  lightBlue: "bg-blue-50",
  lightGreen: "bg-green-50",
};

interface TestProps {
  color: "red" | "blue" | "green" | "yellow" | "purple";
  size: "small" | "medium" | "large" | "xlarge";
  padding: "none" | "small" | "medium" | "large" | "xlarge";
  borderRadius: "none" | "small" | "medium" | "large" | "full";
  background: "transparent" | "white" | "gray" | "lightBlue" | "lightGreen";
}

const Test = ({
  color,
  size,
  padding,
  borderRadius,
  background,
}: TestProps) => {
  return (
    <div
      className={[
        "inline-block font-medium transition-all duration-200 ease-in-out",
        colorStyles[color],
        sizeStyles[size],
        paddingStyles[padding],
        borderRadiusStyles[borderRadius],
        backgroundStyles[background],
      ].join(" ")}
    >
      Tailwind Test Component with Bracket Notation Variants
    </div>
  );
};

export default Test;

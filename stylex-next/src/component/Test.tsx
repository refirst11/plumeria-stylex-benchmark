import * as stylex from "@stylexjs/stylex";
import React from "react";

const styles = stylex.create({
  base: {
    display: "inline-block",
    fontWeight: "500",
    transition: "all 0.2s ease",
  },
});

const colorStyles = stylex.create({
  red: { color: "red" },
  blue: { color: "blue" },
  green: { color: "green" },
  yellow: { color: "yellow" },
  purple: { color: "purple" },
});

const sizeStyles = stylex.create({
  small: { fontSize: "12px" },
  medium: { fontSize: "16px" },
  large: { fontSize: "20px" },
  xlarge: { fontSize: "24px" },
});

const paddingStyles = stylex.create({
  none: { padding: "0" },
  small: { padding: "4px" },
  medium: { padding: "8px" },
  large: { padding: "16px" },
  xlarge: { padding: "24px" },
});

const borderRadiusStyles = stylex.create({
  none: { borderRadius: "0" },
  small: { borderRadius: "2px" },
  medium: { borderRadius: "4px" },
  large: { borderRadius: "8px" },
  full: { borderRadius: "9999px" },
});

const backgroundStyles = stylex.create({
  transparent: { backgroundColor: "transparent" },
  white: { backgroundColor: "white" },
  gray: { backgroundColor: "#f0f0f0" },
  lightBlue: { backgroundColor: "#e3f2fd" },
  lightGreen: { backgroundColor: "#e8f5e9" },
});

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
      {...stylex.props(
        styles.base,
        colorStyles[color],
        sizeStyles[size],
        paddingStyles[padding],
        borderRadiusStyles[borderRadius],
        backgroundStyles[background],
      )}
    >
      StyleX Test Component with Bracket Notation Variants
    </div>
  );
};

export default Test;

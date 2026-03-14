import * as style from "@plumeria/core";

const styles = style.create({
  base: {
    display: "inline-block",
    fontWeight: "500",
    transition: "all 0.2s ease",
  },
  // Color variants
  red: { color: "red" },
  blue: { color: "blue" },
  green: { color: "green" },
  yellow: { color: "yellow" },
  purple: { color: "purple" },
  // Size variants
  small: { fontSize: "12px" },
  medium: { fontSize: "16px" },
  large: { fontSize: "20px" },
  xlarge: { fontSize: "24px" },
  // Padding variants
  paddingNone: { padding: "0" },
  paddingSmall: { padding: "4px" },
  paddingMedium: { padding: "8px" },
  paddingLarge: { padding: "16px" },
  paddingXlarge: { padding: "24px" },
  // BorderRadius variants
  radiusNone: { borderRadius: "0" },
  radiusSmall: { borderRadius: "2px" },
  radiusMedium: { borderRadius: "4px" },
  radiusLarge: { borderRadius: "8px" },
  radiusFull: { borderRadius: "9999px" },
  // Background variants
  bgTransparent: { backgroundColor: "transparent" },
  bgWhite: { backgroundColor: "white" },
  bgGray: { backgroundColor: "#f0f0f0" },
  bgLightBlue: { backgroundColor: "#e3f2fd" },
  bgLightGreen: { backgroundColor: "#e8f5e9" },
});

const getVariants = style.variants({
  color: {
    red: styles.red,
    blue: styles.blue,
    green: styles.green,
    yellow: styles.yellow,
    purple: styles.purple,
  },
  size: {
    small: styles.small,
    medium: styles.medium,
    large: styles.large,
    xlarge: styles.xlarge,
  },
  padding: {
    none: styles.paddingNone,
    small: styles.paddingSmall,
    medium: styles.paddingMedium,
    large: styles.paddingLarge,
    xlarge: styles.paddingXlarge,
  },
  borderRadius: {
    none: styles.radiusNone,
    small: styles.radiusSmall,
    medium: styles.radiusMedium,
    large: styles.radiusLarge,
    full: styles.radiusFull,
  },
  background: {
    transparent: styles.bgTransparent,
    white: styles.bgWhite,
    gray: styles.bgGray,
    lightBlue: styles.bgLightBlue,
    lightGreen: styles.bgLightGreen,
  },
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
      className={style.use(
        styles.base,
        getVariants({
          color,
          size,
          padding,
          borderRadius,
          background,
        }),
      )}
    >
      Plumeria Test Component with Dynamic Variants
    </div>
  );
};

export default Test;

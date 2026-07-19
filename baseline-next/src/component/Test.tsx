import styles from "./Test.module.css";

const colorStyles = {
  red: styles.red,
  blue: styles.blue,
  green: styles.green,
  yellow: styles.yellow,
  purple: styles.purple,
};

const sizeStyles = {
  small: styles.small,
  medium: styles.medium,
  large: styles.large,
  xlarge: styles.xlarge,
};

const paddingStyles = {
  none: styles.paddingNone,
  small: styles.paddingSmall,
  medium: styles.paddingMedium,
  large: styles.paddingLarge,
  xlarge: styles.paddingXlarge,
};

const borderRadiusStyles = {
  none: styles.radiusNone,
  small: styles.radiusSmall,
  medium: styles.radiusMedium,
  large: styles.radiusLarge,
  full: styles.radiusFull,
};

const backgroundStyles = {
  transparent: styles.bgTransparent,
  white: styles.bgWhite,
  gray: styles.bgGray,
  lightBlue: styles.bgLightBlue,
  lightGreen: styles.bgLightGreen,
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
        styles.base,
        colorStyles[color],
        sizeStyles[size],
        paddingStyles[padding],
        borderRadiusStyles[borderRadius],
        backgroundStyles[background],
      ].join(" ")}
    >
      Baseline Test Component with Bracket Notation Variants
    </div>
  );
};

export default Test;
